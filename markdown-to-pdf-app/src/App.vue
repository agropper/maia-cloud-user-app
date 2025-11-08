<script setup>
import { computed, ref } from 'vue'
import { jsPDF } from 'jspdf'
import MarkdownIt from 'markdown-it'

const md = new MarkdownIt({
  html: true,
  breaks: true,
  typographer: true
})

const DEFAULT_RESPONSE = `### Other Testing (past year)

• **Laboratory panel** – Basic metabolic panel, lipid panel, TSH, PSA (screening) – all ordered by Dr. Pasinski during the most recent visit.

• **Vaccinations** – Pneumococcal conjugate vaccine (PCV13) and high-dose trivalent influenza vaccine (65 y +).

**Screening labs** – PSA (stable values ~0.8 ng/mL over prior years).

All information above is drawn directly from the patient’s electronic record; no external data have been added.`

const chatMessages = ref([
  {
    id: 'msg-user-1',
    role: 'user',
    author: 'You',
    content: 'Show me a patient summary.',
    type: 'text'
  },
  {
    id: 'msg-assistant-1',
    role: 'assistant',
    author: 'Anthropic',
    content: DEFAULT_RESPONSE.trim(),
    type: 'markdown',
    metaChips: ['GROPPER_ADRIAN_09_24_25_1314-1.PDF']
  }
])

const isExporting = ref(false)
const statusMessage = ref('')
const exportLog = ref([])

const margin = { top: 48, right: 48, bottom: 48, left: 48 }
const bubbleWidthRatio = 0.9
const bubblePaddingX = 14
const bubblePaddingY = 12
const chipHeight = 16
const chipPaddingX = 6
const chipPaddingY = 4
const chipSpacing = 8
const metaChipHeight = 14
const metaChipPaddingX = 5
const metaChipPaddingY = 2
const metaChipSpacing = 6
const bubbleSpacing = 24
const bubbleCornerRadius = 8

const baseFontSize = 7
const headingFontSizes = { 1: 14, 2: 12, 3: 10, 4: 9 }
const lineHeight = 10
const bulletIndent = 14

const previewMessages = computed(() =>
  chatMessages.value.map(message => ({
    ...message,
    html:
      message.type === 'markdown'
        ? md.render(message.content)
        : `<p>${message.content}</p>`
  }))
)

const formatLog = message => {
  exportLog.value.push(`${new Date().toLocaleTimeString()} ${message}`)
  if (exportLog.value.length > 80) {
    exportLog.value.shift()
  }
  console.log('[PDF EXPORT]', message)
}

const inlineToMarkedText = inline => {
  let result = ''
  let bold = false
  inline?.children?.forEach(child => {
    switch (child.type) {
      case 'strong_open':
        bold = true
        break
      case 'strong_close':
        bold = false
        break
      case 'text':
      case 'code_inline':
        if (child.content) {
          result += bold ? `**${child.content}**` : child.content
        }
        break
      case 'softbreak':
      case 'hardbreak':
        result += '\n'
        break
      default:
        break
    }
  })
  return result.trim()
}

const tokenizeMarkedText = text => {
  const tokens = []
  let buffer = ''
  let bold = false
  let i = 0

  while (i < text.length) {
    if (text.startsWith('**', i)) {
      if (buffer) {
        tokens.push({ text: buffer, bold })
        buffer = ''
      }
      bold = !bold
      i += 2
      continue
    }

    if (text[i] === '\n') {
      if (buffer) {
        tokens.push({ text: buffer, bold })
        buffer = ''
      }
      tokens.push({ newline: true })
      i += 1
      continue
    }

    buffer += text[i]
    i += 1
  }

  if (buffer) {
    tokens.push({ text: buffer, bold })
  }

  return tokens
}

const normalizeText = text =>
  text
    .replace(/[\u2012-\u2015\u2212]/g, '-')
    .replace(/\u00A0/g, ' ')
    .replace(/\s+\n/g, '\n')
    .replace(/\n\s+/g, '\n')
    .replace(/\s+/g, ' ')
    .trim()

const measureMarkedText = (doc, text, width, options = {}) => {
  const tokens = tokenizeMarkedText(text)
  const lineSpacing = options.lineSpacing ?? lineHeight
  let cursorX = 0
  let lines = 1

  tokens.forEach(token => {
    if (token.newline) {
      lines += 1
      cursorX = 0
      return
    }

    const parts = token.text.split(/(\s+)/).filter(Boolean)

    parts.forEach(part => {
      const isWhitespace = /^\s+$/.test(part)

      doc.setFont('helvetica', token.bold ? 'bold' : 'normal')
      doc.setFontSize(options.fontSize ?? baseFontSize)

      const partWidth = doc.getTextWidth(part)

      if (isWhitespace) {
        cursorX += partWidth
        return
      }

      if (partWidth > width) {
        const broken = doc.splitTextToSize(part, width)
        broken.forEach((piece, index) => {
          const pieceWidth = doc.getTextWidth(piece)
          if (cursorX > 0 && cursorX + pieceWidth > width) {
            lines += 1
            cursorX = 0
          }
          cursorX += pieceWidth
          if (index < broken.length - 1) {
            lines += 1
            cursorX = 0
          }
        })
        return
      }

      if (cursorX > 0 && cursorX + partWidth > width) {
        lines += 1
        cursorX = 0
      }

      cursorX += partWidth
    })
  })

  return lines * lineSpacing
}

const renderMarkedText = (doc, text, startX, startY, width, options = {}) => {
  const tokens = tokenizeMarkedText(text)
  const lineSpacing = options.lineSpacing ?? lineHeight
  let cursorX = startX
  let cursorY = startY

  tokens.forEach(token => {
    if (token.newline) {
      cursorY += lineSpacing
      cursorX = startX
      return
    }

    const parts = token.text.split(/(\s+)/).filter(Boolean)

    parts.forEach(part => {
      const isWhitespace = /^\s+$/.test(part)
      doc.setFont('helvetica', token.bold ? 'bold' : 'normal')
      doc.setFontSize(options.fontSize ?? baseFontSize)

      if (isWhitespace) {
        cursorX += doc.getTextWidth(part)
        return
      }

      const broken = doc.splitTextToSize(part, width)
      broken.forEach((piece, index) => {
        const pieceWidth = doc.getTextWidth(piece)
        if (cursorX !== startX && cursorX - startX + pieceWidth > width) {
          cursorY += lineSpacing
          cursorX = startX
        }

        doc.text(piece, cursorX, cursorY, { baseline: 'top' })
        cursorX += pieceWidth

        if (index < broken.length - 1) {
          cursorY += lineSpacing
          cursorX = startX
        }
      })
    })
  })

  return cursorY - startY + lineSpacing
}

const getBlocksFromMessage = message => {
  if (message.type === 'text') {
    return [{ type: 'paragraph', text: message.content }]
  }

  const tokens = md.parse(message.content, {})
  const blocks = []

  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i]

    if (token.type === 'heading_open') {
      const inline = tokens[i + 1]
      if (inline?.type === 'inline') {
        blocks.push({
          type: 'heading',
          level: parseInt(token.tag.replace('h', ''), 10) || 3,
          text: inlineToMarkedText(inline)
        })
      }
    }

    if (token.type === 'paragraph_open') {
      const inline = tokens[i + 1]
      if (inline?.type === 'inline') {
        blocks.push({ type: 'paragraph', text: inlineToMarkedText(inline) })
      }
    }

    if (token.type === 'list_item_open') {
      const inline = tokens[i + 1]
      if (inline?.type === 'inline') {
        const marked = inlineToMarkedText(inline)
        blocks.push({ type: 'bullet', text: marked.length ? marked : inline.content })
      }
    }
  }

  return blocks
}

const measureMessage = (doc, message, bubbleWidth) => {
  const textWidth = bubbleWidth - bubblePaddingX * 2
  const blocks = getBlocksFromMessage(message)
  let contentHeight = 0

  blocks.forEach(block => {
    const fontSize =
      block.type === 'heading' ? headingFontSizes[block.level] || baseFontSize : baseFontSize
    const blockLineHeight =
      block.type === 'heading' ? Math.round(fontSize * 1.4) : lineHeight
    const indent = block.type === 'bullet' ? bulletIndent : 0

    doc.setFont('helvetica', block.type === 'heading' ? 'bold' : 'normal')
    doc.setFontSize(fontSize)
    const height = measureMarkedText(
      doc,
      normalizeText(block.text),
      Math.max(textWidth - indent, 24),
      { fontSize, lineSpacing: blockLineHeight }
    )
    contentHeight += height
  })

  let metaHeight = 0
  if (message.metaChips?.length) {
    metaHeight = metaChipHeight + metaChipSpacing
  }

  const bubbleHeight = bubblePaddingY * 2 + contentHeight + metaHeight
  const totalHeight = chipHeight + chipSpacing + bubbleHeight

  return {
    bubbleHeight,
    contentHeight,
    metaHeight,
    totalHeight,
    blocks
  }
}

const renderMessage = (doc, message, state, bubbleX, bubbleWidth, measurement, colors) => {
  const textStartX = bubbleX + bubblePaddingX
  const textWidth = bubbleWidth - bubblePaddingX * 2

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(baseFontSize + 1)
  const chipTextWidth = doc.getTextWidth(message.author)
  const chipWidth = chipTextWidth + chipPaddingX * 2
  const chipX = message.role === 'user' ? bubbleX + bubbleWidth - chipWidth : bubbleX
  const chipY = state.cursorY

  doc.setFillColor(...colors.chipFill)
  doc.setDrawColor(...colors.chipBorder)
  doc.roundedRect(chipX, chipY, chipWidth, chipHeight, 6, 6, 'FD')
  doc.setTextColor(...colors.chipText)
  doc.text(message.author, chipX + chipPaddingX, chipY + chipHeight / 2 + 2, {
    baseline: 'middle'
  })

  state.cursorY += chipHeight + chipSpacing

  const bubbleY = state.cursorY
  doc.setFillColor(...colors.bubbleFill)
  doc.setDrawColor(...colors.bubbleBorder)
  doc.roundedRect(
    bubbleX,
    bubbleY,
    bubbleWidth,
    measurement.bubbleHeight,
    bubbleCornerRadius,
    bubbleCornerRadius,
    'FD'
  )

  doc.setTextColor(32, 32, 32)

  let contentCursorY = bubbleY + bubblePaddingY

  measurement.blocks.forEach(block => {
    const fontSize =
      block.type === 'heading' ? headingFontSizes[block.level] || baseFontSize : baseFontSize
    const blockLineHeight =
      block.type === 'heading' ? Math.round(fontSize * 1.4) : lineHeight
    const indent = block.type === 'bullet' ? bulletIndent : 0

    if (block.type === 'bullet') {
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(fontSize)
      doc.text('•', textStartX, contentCursorY, { baseline: 'top' })
    }

    doc.setFont('helvetica', block.type === 'heading' ? 'bold' : 'normal')
    doc.setFontSize(fontSize)
    const renderedHeight = renderMarkedText(
      doc,
      normalizeText(block.text),
      textStartX + (block.type === 'bullet' ? indent : 0),
      contentCursorY,
      Math.max(textWidth - (block.type === 'bullet' ? indent : 0), 24),
      { fontSize, lineSpacing: blockLineHeight }
    )

    contentCursorY += renderedHeight
  })

  if (message.metaChips?.length) {
    contentCursorY += metaChipSpacing
    let chipCursorX = textStartX

    message.metaChips.forEach(chip => {
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(baseFontSize + 1)
      const chipTextWidth = doc.getTextWidth(chip)
      const width = chipTextWidth + metaChipPaddingX * 2

      if (chipCursorX + width > bubbleX + bubbleWidth - bubblePaddingX) {
        chipCursorX = textStartX
        contentCursorY += metaChipHeight + metaChipSpacing
      }

      doc.setFillColor(230, 242, 241)
      doc.setDrawColor(180, 208, 203)
      doc.roundedRect(
        chipCursorX,
        contentCursorY,
        width,
        metaChipHeight,
        4,
        4,
        'FD'
      )
      doc.setTextColor(46, 125, 109)
      doc.text(
        chip,
        chipCursorX + metaChipPaddingX,
        contentCursorY + metaChipHeight / 2 + 2,
        { baseline: 'middle' }
      )

      chipCursorX += width + 6
    })

    contentCursorY += metaChipHeight
  }

  state.cursorY = bubbleY + measurement.bubbleHeight + bubbleSpacing
}

const exportToPdf = async () => {
  isExporting.value = true
  statusMessage.value = 'Generating PDF…'
  exportLog.value = []

  try {
    const doc = new jsPDF({
      unit: 'pt',
      format: 'letter',
      orientation: 'portrait'
    })

    const pageWidth = doc.internal.pageSize.getWidth()
    const pageHeight = doc.internal.pageSize.getHeight()
    const bubbleWidth = pageWidth * bubbleWidthRatio

    const state = {
      cursorY: margin.top,
      pageWidth,
      pageHeight
    }

    chatMessages.value.forEach(message => {
      const isUser = message.role === 'user'
      const bubbleX = isUser
        ? pageWidth - bubbleWidth
        : 0

      const measurement = measureMessage(doc, message, bubbleWidth)

      if (state.cursorY + measurement.totalHeight > pageHeight - margin.bottom) {
        doc.addPage()
        state.cursorY = margin.top
        formatLog('Added new page for remaining bubbles.')
      }

      const colors = isUser
        ? {
            bubbleFill: [227, 242, 253],
            bubbleBorder: [197, 219, 240],
            chipFill: [33, 150, 243],
            chipBorder: [25, 118, 210],
            chipText: [255, 255, 255]
          }
        : {
            bubbleFill: [245, 245, 245],
            bubbleBorder: [216, 216, 216],
            chipFill: [232, 245, 253],
            chipBorder: [187, 222, 251],
            chipText: [25, 118, 210]
          }

      renderMessage(doc, message, state, bubbleX, bubbleWidth, measurement, colors)
    })

    const pdfBytes = doc.output('arraybuffer')
    formatLog(`PDF byte length: ${pdfBytes.byteLength}`)
    doc.save('MAIA-chat-prototype.pdf')
    statusMessage.value = 'PDF saved successfully.'
    formatLog('Saved MAIA-chat-prototype.pdf')
  } catch (error) {
    console.error('[PDF EXPORT] Failed to generate PDF:', error)
    statusMessage.value = `PDF export failed: ${error?.message ?? error}`
    formatLog(`Export failed: ${error?.message ?? error}`)
  } finally {
    isExporting.value = false
  }
}
</script>

<template>
  <q-layout view="hhh lpR fff">
    <q-header elevated class="bg-primary text-white">
      <q-toolbar>
        <q-toolbar-title>Chat Bubble PDF Prototype</q-toolbar-title>
        <div class="text-subtitle2">Standalone playground</div>
      </q-toolbar>
    </q-header>

    <q-page-container>
      <q-page padding class="bg-grey-2">
        <div class="column q-gutter-lg">
          <q-card flat bordered class="bg-white">
            <q-card-section>
              <div class="text-h6 q-mb-md">Preview</div>
              <div class="chat-preview">
                <div
                  v-for="message in previewMessages"
                  :key="message.id"
                  :class="[
                    'bubble-row',
                    message.role === 'user' ? 'justify-end' : 'justify-start'
                  ]"
                >
                  <div class="bubble-column">
                    <q-chip
                      dense
                      square
                      :class="['author-chip', message.role]"
                    >
                      {{ message.author }}
                    </q-chip>

                    <div :class="['bubble', message.role]">
                      <div
                        class="bubble-content"
                        v-html="message.html"
                      ></div>

                      <div
                        v-if="message.metaChips?.length"
                        class="meta-chip-row"
                      >
                        <q-chip
                          v-for="chip in message.metaChips"
                          :key="chip"
                          dense
                          class="meta-chip"
                        >
                          {{ chip }}
                        </q-chip>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </q-card-section>
          </q-card>

          <div class="row items-center q-gutter-sm">
            <q-btn
              color="primary"
              icon="picture_as_pdf"
              label="Save as PDF"
              :loading="isExporting"
              @click="exportToPdf"
            />
            <q-spinner-hourglass v-if="isExporting" color="primary" size="32px" />
            <div v-if="statusMessage" class="text-body2 text-grey-8">
              {{ statusMessage }}
            </div>
          </div>

          <q-card v-if="exportLog.length" flat bordered class="bg-grey-1">
            <q-card-section>
              <div class="text-subtitle2 q-mb-sm">Export log (latest first)</div>
              <div class="export-log">
                <div
                  v-for="(entry, idx) in [...exportLog].reverse()"
                  :key="idx"
                  class="log-entry"
                >
                  {{ entry }}
                </div>
              </div>
            </q-card-section>
          </q-card>
  </div>
      </q-page>
    </q-page-container>
  </q-layout>
</template>

<style scoped>
.chat-preview {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.bubble-row {
  display: flex;
}

.bubble-row.justify-start {
  justify-content: flex-start;
}

.bubble-row.justify-end {
  justify-content: flex-end;
}

.bubble-column {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 90%;
  max-width: 90%;
}

.author-chip {
  align-self: flex-start;
  font-weight: 600;
  font-size: 12px;
  padding: 6px 12px;
  border-radius: 6px;
  color: white;
}

.author-chip.user {
  background: #1e88e5;
}

.author-chip.assistant {
  background: #26a69a;
}

.bubble {
  border-radius: 14px;
  padding: 18px 20px;
  box-shadow: 0 6px 16px rgba(15, 23, 42, 0.15);
  background: #fafafa;
  color: #1f1f1f;
  line-height: 1.55;
  font-size: 14px;
}

.bubble.user {
  background: #e3f2fd;
}

.bubble.assistant {
  background: #ffffff;
}

.bubble-content :deep(h1),
.bubble-content :deep(h2),
.bubble-content :deep(h3),
.bubble-content :deep(h4) {
  font-weight: 600;
  margin: 0.75em 0 0.35em;
}

.bubble-content :deep(p),
.bubble-content :deep(li) {
  margin: 0.35em 0;
}

.bubble-content :deep(strong) {
  font-weight: 700;
}

.meta-chip-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 12px;
}

.meta-chip {
  background: #e6f2f1;
  color: #1b5e20;
  font-size: 12px;
}

.export-log {
  max-height: 220px;
  overflow-y: auto;
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, Courier, monospace;
  font-size: 12px;
  line-height: 1.4;
}

.log-entry + .log-entry {
  margin-top: 4px;
}
</style>
