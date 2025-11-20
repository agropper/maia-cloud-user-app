/**
 * PDF Parser Service
 * Extracts structured text from PDFs with page boundary preservation
 * Uses pdfjs-dist for accurate text extraction with position information
 */

// Use legacy build for Node.js environments
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Configure PDF.js worker for Node.js
// Use the legacy worker from node_modules
try {
  // Try different possible worker paths for legacy build
  const possiblePaths = [
    join(__dirname, '../../node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs'),
    join(__dirname, '../../node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs'),
    join(__dirname, '../../node_modules/pdfjs-dist/build/pdf.worker.mjs')
  ];
  
  let workerSet = false;
  for (const workerPath of possiblePaths) {
    if (existsSync(workerPath)) {
      pdfjsLib.GlobalWorkerOptions.workerSrc = workerPath;
      workerSet = true;
      console.log(`✅ PDF.js worker set to: ${workerPath}`);
      break;
    }
  }
  
  if (!workerSet) {
    // Fallback: use CDN or let pdfjs-dist use its default
    console.warn('⚠️ Could not find PDF.js worker file, using default');
  }
} catch (error) {
  console.warn('⚠️ Could not set PDF.js worker path:', error.message);
}

/**
 * Extract text from PDF with page boundaries preserved
 * @param {Buffer|Uint8Array} pdfBuffer - PDF file buffer
 * @returns {Promise<Array<{page: number, text: string, markdown: string}>>} Array of page objects with text and markdown
 */
export async function extractPdfWithPages(pdfBuffer) {
  try {
    // Convert Buffer to Uint8Array if needed (pdfjs-dist legacy build requires Uint8Array)
    const pdfData = pdfBuffer instanceof Buffer 
      ? new Uint8Array(pdfBuffer) 
      : pdfBuffer;
    
    const loadingTask = pdfjsLib.getDocument({
      data: pdfData,
      useSystemFonts: true
    });

    const pdfDocument = await loadingTask.promise;
    const numPages = pdfDocument.numPages;
    const pages = [];

    for (let pageNum = 1; pageNum <= numPages; pageNum++) {
      const page = await pdfDocument.getPage(pageNum);
      const textContent = await page.getTextContent();
      
      // Extract text items with position information
      const textItems = textContent.items.map(item => ({
        str: item.str,
        x: item.transform[4], // x position
        y: item.transform[5], // y position
        width: item.width,
        height: item.height,
        fontName: item.fontName,
        fontSize: item.height // approximate font size
      }));

      // Group text items by lines (similar y positions)
      const lines = groupTextIntoLines(textItems);
      
      // Convert lines to markdown with structure preservation
      const markdown = convertLinesToMarkdown(lines);
      
      // Also get plain text
      const text = textContent.items.map(item => item.str).join(' ');

      pages.push({
        page: pageNum,
        text: text,
        markdown: markdown,
        lineCount: lines.length,
        itemCount: textItems.length
      });
    }

    return {
      success: true,
      totalPages: numPages,
      pages: pages
    };
  } catch (error) {
    console.error('PDF extraction error:', error);
    throw new Error(`Failed to extract PDF: ${error.message}`);
  }
}

/**
 * Group text items into lines based on y-position
 * @param {Array} textItems - Array of text items with position info
 * @returns {Array<Array>} Array of lines, each containing text items
 */
function groupTextIntoLines(textItems) {
  if (textItems.length === 0) return [];

  // Sort by y position (top to bottom) and then by x position (left to right)
  const sorted = [...textItems].sort((a, b) => {
    const yDiff = Math.abs(b.y - a.y);
    // If y positions are very close (same line), sort by x
    if (yDiff < 2) {
      return a.x - b.x;
    }
    // Otherwise sort by y (top to bottom)
    return b.y - a.y;
  });

  const lines = [];
  let currentLine = [sorted[0]];
  let currentY = sorted[0].y;

  for (let i = 1; i < sorted.length; i++) {
    const item = sorted[i];
    const yDiff = Math.abs(item.y - currentY);

    // If y position is similar (within 2 pixels), add to current line
    if (yDiff < 2) {
      currentLine.push(item);
    } else {
      // New line detected
      lines.push(currentLine);
      currentLine = [item];
      currentY = item.y;
    }
  }

  // Add the last line
  if (currentLine.length > 0) {
    lines.push(currentLine);
  }

  return lines;
}

/**
 * Convert lines of text items to markdown format
 * Preserves structure like headings, lists, and paragraphs
 * @param {Array<Array>} lines - Array of lines, each containing text items
 * @returns {string} Markdown formatted text
 */
function convertLinesToMarkdown(lines) {
  const markdownLines = [];
  
  for (const line of lines) {
    if (line.length === 0) {
      markdownLines.push('');
      continue;
    }

    // Join text items in the line
    const lineText = line.map(item => item.str).join(' ').trim();
    
    if (!lineText) {
      markdownLines.push('');
      continue;
    }

    // Detect headings (larger font size or all caps)
    const avgFontSize = line.reduce((sum, item) => sum + (item.fontSize || 12), 0) / line.length;
    const isAllCaps = lineText === lineText.toUpperCase() && lineText.length > 3;
    const isLikelyHeading = avgFontSize > 14 || (isAllCaps && lineText.length < 100);

    if (isLikelyHeading) {
      // Determine heading level based on font size
      let level = 2; // Default to h2
      if (avgFontSize > 18) level = 1;
      else if (avgFontSize > 16) level = 2;
      else if (avgFontSize > 14) level = 3;
      
      markdownLines.push(`${'#'.repeat(level)} ${lineText}`);
    } else {
      // Regular paragraph
      markdownLines.push(lineText);
    }
  }

  return markdownLines.join('\n');
}

/**
 * Extract encounters from PDF pages
 * Looks for common encounter patterns in medical records
 * @param {Array} pages - Array of page objects from extractPdfWithPages
 * @returns {Array} Array of encounter objects
 */
export function extractEncounters(pages) {
  const encounters = [];
  const encounterPatterns = [
    /(?:encounter|visit|appointment|consultation)[\s:]+(?:date|on)[\s:]*([0-9]{1,2}[\/\-][0-9]{1,2}[\/\-][0-9]{2,4})/i,
    /([0-9]{1,2}[\/\-][0-9]{1,2}[\/\-][0-9]{2,4})[\s:]+(?:encounter|visit|appointment|consultation)/i,
    /(?:date|on)[\s:]+([0-9]{1,2}[\/\-][0-9]{1,2}[\/\-][0-9]{2,4})/i
  ];

  for (const page of pages) {
    const lines = page.markdown.split('\n');
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // Look for date patterns
      for (const pattern of encounterPatterns) {
        const match = line.match(pattern);
        if (match) {
          const date = match[1];
          
          // Try to extract provider, location, and diagnosis from surrounding lines
          const context = extractEncounterContext(lines, i);
          
          encounters.push({
            page: page.page,
            date: date,
            provider: context.provider || '',
            location: context.location || '',
            diagnosis: context.diagnosis || '',
            notes: context.notes || '',
            rawText: line
          });
          
          break; // Found an encounter, move to next line
        }
      }
    }
  }

  return encounters;
}

/**
 * Extract context around an encounter line
 * Looks for provider, location, diagnosis in nearby lines
 * @param {Array<string>} lines - All lines from the page
 * @param {number} index - Index of the encounter line
 * @returns {Object} Context object with provider, location, diagnosis, notes
 */
function extractEncounterContext(lines, index) {
  const context = {
    provider: '',
    location: '',
    diagnosis: '',
    notes: ''
  };

  // Look at 5 lines before and 10 lines after
  const start = Math.max(0, index - 5);
  const end = Math.min(lines.length, index + 10);
  const contextLines = lines.slice(start, end);

  for (let i = 0; i < contextLines.length; i++) {
    const line = contextLines[i].toLowerCase();
    
    // Look for provider patterns
    if (!context.provider) {
      if (line.match(/(?:provider|physician|doctor|dr\.|md)[\s:]+(.+)/i)) {
        context.provider = contextLines[i].replace(/^(?:provider|physician|doctor|dr\.|md)[\s:]+/i, '').trim();
      }
    }

    // Look for location patterns
    if (!context.location) {
      if (line.match(/(?:location|facility|clinic|hospital)[\s:]+(.+)/i)) {
        context.location = contextLines[i].replace(/^(?:location|facility|clinic|hospital)[\s:]+/i, '').trim();
      }
    }

    // Look for diagnosis patterns
    if (!context.diagnosis) {
      if (line.match(/(?:diagnosis|dx|condition|problem)[\s:]+(.+)/i)) {
        context.diagnosis = contextLines[i].replace(/^(?:diagnosis|dx|condition|problem)[\s:]+/i, '').trim();
      }
    }
  }

  // Collect notes (lines after the encounter that aren't structured fields)
  const notesLines = [];
  for (let i = index + 1; i < Math.min(lines.length, index + 15); i++) {
    const line = lines[i].trim();
    if (line && !line.match(/^(?:provider|location|diagnosis|date|encounter)[\s:]/i)) {
      notesLines.push(line);
    } else {
      break;
    }
  }
  context.notes = notesLines.join(' ').trim();

  return context;
}

/**
 * Extract individual clinical notes from markdown
 * Parses the "Clinical Notes" category and splits into individual notes
 * Clinical notes typically start with dates like "Oct 27, 2025" or "10/27/2025"
 * and contain structured fields like "Author:", "Category:", "Created:", etc.
 * @param {string} fullMarkdown - Full markdown text from PDF
 * @param {Array} pages - Array of page objects with page numbers
 * @returns {Array<{fileName: string, page: number, category: string, content: string, markdown: string, noteIndex: number}>} Array of individual clinical notes
 */
export function extractIndividualClinicalNotes(fullMarkdown, pages, fileName = '') {
  const notes = [];
  
  // [INDEXING] Debug: Count "Category: " instances
  const categoryPattern = /Category:\s+/gi;
  const allCategoryMatches = [];
  let categoryMatch;
  while ((categoryMatch = categoryPattern.exec(fullMarkdown)) !== null) {
    allCategoryMatches.push(categoryMatch.index);
  }
  
  // Count categories in first 40 pages
  let categoriesInFirst40Pages = 0;
  let charCount = 0;
  for (let i = 0; i < Math.min(40, pages.length); i++) {
    const pageMarkdown = `## Page ${pages[i].page}\n\n${pages[i].markdown}`;
    const pageStart = charCount;
    const pageEnd = charCount + pageMarkdown.length;
    
    // Count categories in this page
    const categoriesInPage = allCategoryMatches.filter(idx => idx >= pageStart && idx < pageEnd).length;
    categoriesInFirst40Pages += categoriesInPage;
    
    charCount = pageEnd + 10; // Add padding
  }
  
  console.log(`[INDEXING] Found ${allCategoryMatches.length} instances of "Category: " in the whole document`);
  console.log(`[INDEXING] Found ${categoriesInFirst40Pages} instances of "Category: " in the first 40 pages`);
  
  // Find ALL "Clinical Notes" sections
  // Look for headings like "### Clinical Notes", "## Clinical Notes", etc.
  // Use global flag to find all occurrences
  const clinicalNotesPattern = /(?:^|\n)(?:#{1,3})\s*Clinical\s+Notes\s*(?:\n|$)/gi;
  const allMatches = [];
  let match;
  
  // Find all matches
  while ((match = clinicalNotesPattern.exec(fullMarkdown)) !== null) {
    allMatches.push({
      index: match.index,
      length: match[0].length,
      start: match.index + match[0].length
    });
  }
  
  if (allMatches.length === 0) {
    console.log('⚠️ No "Clinical Notes" section found in markdown');
    return notes;
  }
  
  console.log(`📝 Found ${allMatches.length} "Clinical Notes" section(s) in markdown`);
  
  // Process each Clinical Notes section
  for (let sectionIdx = 0; sectionIdx < allMatches.length; sectionIdx++) {
    const notesBeforeThisSection = notes.length;
    const sectionMatch = allMatches[sectionIdx];
    const sectionStart = sectionMatch.start;
    
    // Find the end of this section (next major heading or next Clinical Notes section or end of document)
    let sectionEnd = fullMarkdown.length;
    
    // Check if there's a next Clinical Notes section
    if (sectionIdx < allMatches.length - 1) {
      sectionEnd = allMatches[sectionIdx + 1].index;
    } else {
      // Last section - find next major heading (## or #) or end of document
      const restOfMarkdown = fullMarkdown.substring(sectionStart);
      const nextMajorSectionMatch = restOfMarkdown.match(/\n(?:##|#)\s+/);
      if (nextMajorSectionMatch) {
        sectionEnd = sectionStart + nextMajorSectionMatch.index;
      }
    }
    
    // Extract this Clinical Notes section
    let clinicalNotesSection = fullMarkdown.substring(sectionStart, sectionEnd);
    
    // Filter out common headers and footers
    // Headers/footers are typically repeated patterns that appear on every page
    // Common patterns: page numbers, dates, institution names at top/bottom
    const headerFooterPatterns = [
      /^Page\s+\d+/i, // "Page 1", "Page 2", etc.
      /^\d+\s*$/m, // Standalone page numbers
      /^Apple\s+Health/i, // Common header
      /^Adrian\s+Gropper/i, // Common header
      /^\d{4}-\d{2}-\d{2}/, // Date-only lines (likely headers/footers)
      /^Generated\s+on/i, // Footer text
      /^Exported\s+on/i, // Footer text
    ];
    
    // Remove header/footer lines
    const lines = clinicalNotesSection.split('\n');
    const filteredLines = [];
    const lineFrequency = new Map(); // Track line frequency to identify repeated headers/footers
    
    // First pass: count line frequencies
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && trimmed.length > 0) {
        const normalized = trimmed.toLowerCase().replace(/\s+/g, ' ');
        lineFrequency.set(normalized, (lineFrequency.get(normalized) || 0) + 1);
      }
    }
    
    // Second pass: filter out headers/footers
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.length === 0) {
        filteredLines.push(line); // Keep blank lines
        continue;
      }
      
      // Check if it matches header/footer patterns
      const isHeaderFooter = headerFooterPatterns.some(pattern => pattern.test(trimmed));
      
      // Check if line appears too frequently (likely a header/footer)
      const normalized = trimmed.toLowerCase().replace(/\s+/g, ' ');
      const frequency = lineFrequency.get(normalized) || 0;
      const isRepeated = frequency > 5; // If appears more than 5 times, likely header/footer
      
      // Keep the line if it's not a header/footer pattern and not too frequently repeated
      if (!isHeaderFooter && !isRepeated) {
        filteredLines.push(line);
      }
    }
    
    clinicalNotesSection = filteredLines.join('\n');
    
    // Split into lines for better processing
    const processedLines = clinicalNotesSection.split('\n');
    
    // Pattern to identify the start of a new clinical note:
    // 1. Date patterns at the start of a line (various formats):
    //    - "Oct 27, 2025" or "October 27, 2025"
    //    - "10/27/2025" or "10-27-2025"
    //    - "2025-10-27"
    // 2. Followed by institution name or encounter type
    // 3. Or directly followed by "Author:", "Category:", etc.
    
    const datePatterns = [
      /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2},?\s+\d{4}/i, // "Oct 27, 2025" or "October 27, 2025"
      /^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}/, // "10/27/2025" or "10-27-2025"
      /^\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2}/, // "2025-10-27"
    ];
    
    // Additional patterns that indicate a new note (removed Category: Clinical Note requirement):
    const noteStartPatterns = [
      /^Author:\s+/i,
      /^Category:\s+/i, // Accept any category, not just "Clinical Note"
      /^Created:\s+/i,
      /^Status:\s+/i,
      /Telephone\s+Encounter/i,
      /In-Person\s+Encounter/i,
      /Video\s+Encounter/i,
    ];
  
    // Find all potential note start positions
    // Use "Created:" as the primary indicator of a new note
    // The note starts with a date line followed by a location, just a few lines before "Created:"
    const noteStarts = [];
    
    for (let i = 0; i < processedLines.length; i++) {
      const line = processedLines[i].trim();
      if (!line) continue;
      
      // Look for "Created:" as the primary note start indicator
      if (/^Created:\s+/i.test(line)) {
        // Found a "Created:" line - this indicates a new note
        // Each "Created:" is a unique note, even if multiple notes share the same date header
        // Look backwards up to 20 lines to find the date line
        let noteStartLine = i; // Default to "Created:" line itself if no date found
        
        // Look backwards up to 20 lines to find the date line
        for (let j = i - 1; j >= Math.max(0, i - 20); j--) {
          const prevLine = processedLines[j].trim();
          if (!prevLine) continue;
          
          // Stop if we hit another "Created:" line (that's a different note)
          if (/^Created:\s+/i.test(prevLine)) {
            break;
          }
          
          // Check if this line is a date (at the start of the line)
          const isDate = datePatterns.some(pattern => pattern.test(prevLine));
          
          if (isDate) {
            // Found a date - use it as the note start
            // Multiple notes can share the same date header - that's OK, they're still separate notes
            noteStartLine = j;
            break; // Use the first (closest) date we find going backwards
          }
        }
        
        // Always add the note start - each "Created:" is a unique note
        // Even if multiple notes share the same date header, they're still separate notes
        noteStarts.push(noteStartLine);
      }
    }
    
    console.log(`[INDEXING] Found ${noteStarts.length} note starts via "Created:" method`);
    
    // Sort note starts
    noteStarts.sort((a, b) => a - b);
    
    // [INDEXING] Debug: Count date patterns in this section
    let datePatternCount = 0;
    for (const line of processedLines) {
      const trimmed = line.trim();
      if (trimmed && datePatterns.some(pattern => pattern.test(trimmed))) {
        datePatternCount++;
      }
    }
    
    if (sectionIdx === 0 || sectionIdx < 3) {
      console.log(`[INDEXING] Section ${sectionIdx + 1}: Found ${datePatternCount} date patterns, identified ${noteStarts.length} note starts`);
    }
    
    // Extract notes between start positions
    for (let i = 0; i < noteStarts.length; i++) {
      const startLine = noteStarts[i];
      const endLine = i < noteStarts.length - 1 ? noteStarts[i + 1] : processedLines.length;
      
      // Extract note content
      const noteLines = processedLines.slice(startLine, endLine);
      let noteText = noteLines.join('\n').trim();
      
      // Extract metadata: find the last date and location in the note
      let lastDate = '';
      let lastLocation = '';
      
      // Location patterns
      const locationPatterns = [
        /mass general/i,
        /brigham/i,
        /hospital/i,
        /medical center/i,
        /clinic/i,
      ];
      
      // Look through all lines in the note to find dates and locations
      for (const line of noteLines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        
        // Check if this line is a date
        const isDate = datePatterns.some(pattern => pattern.test(trimmed));
        if (isDate) {
          // Extract the date (take the first match)
          for (const pattern of datePatterns) {
            const match = trimmed.match(pattern);
            if (match) {
              lastDate = match[0].trim();
              break;
            }
          }
        }
        
        // Check if this line contains a location
        for (const locationPattern of locationPatterns) {
          if (locationPattern.test(trimmed)) {
            // Extract location - try to get a meaningful phrase
            // Look for common patterns like "Mass General Brigham" or institution names
            let locationText = trimmed;
            
            // Try to extract just the institution name part
            const locationMatch = trimmed.match(/(?:mass general\s+brigham|brigham|mass general|hospital|medical center|clinic)[^,\n]*/i);
            if (locationMatch) {
              locationText = locationMatch[0].trim();
            }
            
            // Only update if we found a substantial location (not just a word)
            if (locationText.length > 5) {
              lastLocation = locationText;
            }
            break;
          }
        }
      }
      
      // Clean up the note - remove any remaining header/footer artifacts
      // Remove lines that are just dates or page numbers at the start/end
      const noteLinesArray = noteText.split('\n');
      const cleanedLines = [];
      for (let j = 0; j < noteLinesArray.length; j++) {
        const line = noteLinesArray[j].trim();
        if (!line) {
          cleanedLines.push('');
          continue;
        }
        
        // Skip lines that are just dates or page numbers (likely artifacts)
        const isJustDate = datePatterns.some(pattern => pattern.test(line) && line.length < 30);
        const isPageNumber = /^Page\s+\d+$/i.test(line) || /^\d+$/.test(line);
        
        if (!isJustDate && !isPageNumber) {
          cleanedLines.push(noteLinesArray[j]);
        }
      }
      
      noteText = cleanedLines.join('\n').trim();
    
    // Skip very short notes (likely false positives)
    if (noteText.length < 30) continue;
    
    // Find which page this note belongs to
    // Count characters up to this note in the current clinical notes section
    let charCountInSection = 0;
    for (let j = 0; j < startLine; j++) {
      charCountInSection += processedLines[j].length + 1; // +1 for newline
    }
    
    // Calculate absolute position in full markdown
    const notePositionInFull = sectionStart + charCountInSection;
    
    let notePage = 1;
    let accumulatedLength = 0;
    
    for (const page of pages) {
      const pageMarkdown = `## Page ${page.page}\n\n${page.markdown}`;
      accumulatedLength += pageMarkdown.length + 10;
      
      // Check if this note's position in the full markdown falls within this page
      if (notePositionInFull <= accumulatedLength) {
        notePage = page.page;
        break;
      }
    }
    
    // Extract plain text from markdown (remove markdown syntax)
    const plainText = noteText
      .replace(/^#{1,6}\s+/gm, '') // Remove headings
      .replace(/\*\*(.+?)\*\*/g, '$1') // Remove bold
      .replace(/\*(.+?)\*/g, '$1') // Remove italic
      .replace(/\[(.+?)\]\(.+?\)/g, '$1') // Remove links
      .replace(/`(.+?)`/g, '$1') // Remove code
      .trim();
    
    notes.push({
      fileName: fileName,
      page: notePage,
      category: 'Clinical Notes',
      content: plainText,
      markdown: noteText,
      noteIndex: notes.length + 1,
      date: lastDate || '',
      location: lastLocation || ''
    });
    }
    
    const notesAddedInThisSection = notes.length - notesBeforeThisSection;
    
    // [INDEXING] Debug: Count categories in this section
    const categoriesInSection = (clinicalNotesSection.match(/Category:\s+/gi) || []).length;
    
    if (notesAddedInThisSection > 0) {
      console.log(`📝 Extracted ${notesAddedInThisSection} notes from Clinical Notes section ${sectionIdx + 1}/${allMatches.length} (${categoriesInSection} "Category: " instances in section)`);
    } else {
      console.log(`[INDEXING] No notes extracted from Clinical Notes section ${sectionIdx + 1}/${allMatches.length} (${categoriesInSection} "Category: " instances in section)`);
    }
  }
  
  console.log(`📝 Extracted ${notes.length} total individual clinical notes from ${allMatches.length} section(s)`);
  console.log(`[INDEXING] Total "Category: " instances found: ${allCategoryMatches.length}, Notes extracted: ${notes.length}`);
  
  // Debug: Log first few note starts if we found any
  if (notes.length > 0) {
    console.log(`📝 First note preview (first 200 chars): ${notes[0].markdown.substring(0, 200)}...`);
    if (notes.length > 1) {
      console.log(`📝 Second note preview (first 200 chars): ${notes[1].markdown.substring(0, 200)}...`);
    }
    if (notes.length > 2) {
      console.log(`📝 Third note preview (first 200 chars): ${notes[2].markdown.substring(0, 200)}...`);
    }
  }
  
  return notes;
}

