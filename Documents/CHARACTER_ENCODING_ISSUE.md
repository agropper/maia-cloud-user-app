# Character Encoding Issue: "E" Characters Not Displaying Properly

## Problem Description

When displaying markdown extracted from PDF files, certain characters (particularly "E") are not displaying correctly. For example:

**Expected:** `## ALLERGY   ONSET   RECORDED   PROVIDER`  
**Actual:** `## ALLERGY   ONSET   RECORDED   PROVIDER` (with strange characters where "E" should be)

## Root Cause

This is a **font encoding issue** in the PDF extraction process. The problem occurs because:

1. **Custom Font Encoding**: PDFs can use custom fonts with non-standard character mappings. When a PDF uses a font where the character code for "E" doesn't map to standard Unicode/ASCII, the extraction library (pdfjs-dist) may not correctly decode it.

2. **Font Subsets**: Many PDFs embed font subsets that only include the characters actually used in the document. These subsets may use custom encoding schemes (like CID encoding) that don't directly map to Unicode.

3. **Ligatures and Special Characters**: Some fonts use ligatures (like "fi", "fl", "ff") or special typographic characters that get encoded as single character codes, which may not be properly decoded.

4. **Encoding Mismatch**: The PDF.js library extracts text using `item.str` from the text content, but if the font's encoding isn't properly handled, characters may be decoded incorrectly.

## Technical Details

The PDF extraction happens in `server/utils/pdf-parser.js` using `pdfjs-dist`:

```javascript
const textContent = await page.getTextContent();
const textItems = textContent.items.map(item => ({
  str: item.str,  // This is where character encoding issues occur
  // ...
}));
```

The `item.str` property contains the extracted text, but if the PDF's font encoding isn't properly handled by PDF.js, characters may be incorrectly decoded.

## Solutions

### Option 1: Font Encoding Normalization (Recommended)
Add character normalization after extraction to handle common encoding issues:

```javascript
// Normalize extracted text
const normalizedText = textContent.items.map(item => {
  // Try to fix common encoding issues
  let str = item.str;
  // Replace common problematic characters
  str = str.replace(/[\uFFFD\uFEFF]/g, ''); // Remove replacement characters
  // Add more specific replacements as needed
  return str;
});
```

### Option 2: Use Font Information
PDF.js provides font information in `textContent.items`. We could use this to better decode characters:

```javascript
const textContent = await page.getTextContent();
const textItems = textContent.items.map(item => {
  // Access font information if available
  const fontName = item.fontName;
  // Use font-specific decoding if needed
  return item.str;
});
```

### Option 3: Post-Processing Text Cleanup
Add a cleanup step after extraction to fix known character issues:

```javascript
function cleanExtractedText(text) {
  // Fix common encoding issues
  return text
    .replace(/[^\x00-\x7F]/g, 'E') // Replace non-ASCII with E (temporary fix)
    // Or use a more sophisticated mapping
    .normalize('NFD') // Normalize Unicode
    .replace(/[\u0300-\u036f]/g, ''); // Remove diacritics
}
```

### Option 4: Use Alternative Extraction Method
Consider using a different PDF extraction library that handles font encoding better, or use OCR as a fallback for problematic pages.

## Immediate Workaround

For the specific case where "E" characters are problematic, you could add a post-processing step:

```javascript
// In server/routes/files.js, after markdown extraction
fullMarkdown = fullMarkdown.replace(/[^\x00-\x7F]/g, (char) => {
  // Map problematic characters to their likely intended values
  const charCode = char.charCodeAt(0);
  // Add specific mappings based on observed issues
  if (charCode >= 0xE000 && charCode <= 0xF8FF) {
    return 'E'; // Private use area characters often map to E
  }
  return char;
});
```

## Long-term Solution

The best long-term solution would be to:

1. **Improve Font Handling**: Enhance the PDF extraction to better handle custom font encodings
2. **Character Mapping**: Create a mapping table for common problematic character codes
3. **Validation**: Add validation to detect and report encoding issues during extraction
4. **User Feedback**: Allow users to report encoding issues and build a database of fixes

## Related Files

- `server/utils/pdf-parser.js` - PDF extraction logic
- `server/routes/files.js` - File processing routes
- `src/components/Lists.vue` - Frontend display of extracted markdown
