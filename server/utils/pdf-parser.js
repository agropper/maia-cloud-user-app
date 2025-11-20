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

