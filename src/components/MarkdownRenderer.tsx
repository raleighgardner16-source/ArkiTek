import type React from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import 'katex/dist/katex.min.css'
import { spacing, fontWeight, radius } from '../utils/styles'

interface Props {
  content: string
  theme: any
  fontSize?: string
  lineHeight?: string
}

/**
 * Reusable markdown renderer that styles markdown content
 * to match the app's theme. Used for model responses, conversation
 * history, and saved conversations.
 */
const MarkdownRenderer = ({ content, theme, fontSize = '0.9rem', lineHeight = '1.7' }: Props) => {
  if (!content) return null
  const sanitizeSourceLabels = (input: string) => {
    return String(input)
      // Remove fake self-referential markdown links like [Source 3](Source 3)
      .replace(/\[\s*source\s*\d+\s*\]\(\s*source\s*\d+\s*\)/gi, '')
      // Remove bracket/parenthesis citation labels like [Source 3] or (Source 3)
      .replace(/\[\s*source\s*\d+\s*\]/gi, '')
      .replace(/\(\s*source\s*\d+\s*\)/gi, '')
      // Remove standalone "Source 3" tokens
      .replace(/\bsource\s*\d+\b/gi, '')
      // Normalize leftover punctuation/spacing after removals
      .replace(/\(\s*\)/g, '')
      .replace(/\[\s*\]/g, '')
      // Normalize only horizontal whitespace — keep newlines for markdown structure
      .replace(/[ \t]{2,}/g, ' ')
      .replace(/\n[ \t]+\n/g, '\n\n')
      .trim()
  }
  const cleanedContent = sanitizeSourceLabels(content)

  return (
    <div
      className="markdown-body"
      style={{
        fontSize,
        lineHeight,
        color: theme.textSecondary,
        maxWidth: '100%',
        minWidth: 0,
        overflowX: 'hidden',
        overflowWrap: 'anywhere',
        wordBreak: 'break-word',
      }}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={{
          // Headings
          h1: ({ children }) => (
            <h1 style={{
              fontSize: '1.4em',
              fontWeight: fontWeight.bold,
              color: theme.text,
              margin: `${spacing['2xl']} 0 10px 0`,
              paddingBottom: spacing.sm,
              borderBottom: `1px solid ${theme.borderLight}`,
            }}>{children}</h1>
          ),
          h2: ({ children }) => (
            <h2 style={{
              fontSize: '1.2em',
              fontWeight: fontWeight.bold,
              color: theme.text,
              margin: `18px 0 ${spacing.md} 0`,
              paddingBottom: spacing.xs,
              borderBottom: `1px solid ${theme.borderLight}`,
            }}>{children}</h2>
          ),
          h3: ({ children }) => (
            <h3 style={{
              fontSize: '1.05em',
              fontWeight: fontWeight.semibold,
              color: theme.text,
              margin: `14px 0 ${spacing.sm} 0`,
            }}>{children}</h3>
          ),
          h4: ({ children }) => (
            <h4 style={{
              fontSize: '1em',
              fontWeight: fontWeight.semibold,
              color: theme.text,
              margin: `${spacing.lg} 0 ${spacing.xs} 0`,
            }}>{children}</h4>
          ),

          // Paragraphs
          p: ({ children }) => (
            <p style={{
              margin: `${spacing.md} 0`,
              color: theme.textSecondary,
              lineHeight,
              overflowWrap: 'anywhere',
              wordBreak: 'break-word',
            }}>{children}</p>
          ),

          // Bold and italic
          strong: ({ children }) => (
            <strong style={{ color: theme.text, fontWeight: fontWeight.semibold }}>{children}</strong>
          ),
          em: ({ children }) => (
            <em style={{ color: theme.textSecondary }}>{children}</em>
          ),

          // Lists
          ul: ({ children }) => (
            <ul style={{
              margin: `${spacing.sm} 0`,
              paddingLeft: spacing['2xl'],
              listStyleType: 'disc',
            }}>{children}</ul>
          ),
          ol: ({ children }) => (
            <ol style={{
              margin: `${spacing.sm} 0`,
              paddingLeft: spacing['2xl'],
            }}>{children}</ol>
          ),
          li: ({ children }) => (
            <li style={{
              margin: `${spacing.xs} 0`,
              color: theme.textSecondary,
              lineHeight: '1.6',
              overflowWrap: 'anywhere',
              wordBreak: 'break-word',
            }}>{children}</li>
          ),

          // Links
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                color: theme.accent,
                textDecoration: 'none',
                overflowWrap: 'anywhere',
                wordBreak: 'break-word',
              }}
              onMouseEnter={(e) => { (e.target as HTMLElement).style.textDecoration = 'underline' }}
              onMouseLeave={(e) => { (e.target as HTMLElement).style.textDecoration = 'none' }}
            >{children}</a>
          ),

          // Code (inline and block)
          code: ({ inline, className, children }: { inline?: boolean; className?: string; children?: React.ReactNode }) => {
            if (inline) {
              return (
                <code style={{
                  background: theme.buttonBackground,
                  border: `1px solid ${theme.borderLight}`,
                  borderRadius: radius.xs,
                  padding: '1px 5px',
                  fontSize: '0.88em',
                  fontFamily: 'monospace',
                  color: theme.accent,
                  overflowWrap: 'anywhere',
                  wordBreak: 'break-all',
                }}>{children}</code>
              )
            }
            return (
              <code style={{
                fontFamily: 'monospace',
                fontSize: '0.88em',
              }}>{children}</code>
            )
          },
          pre: ({ children }) => (
            <pre style={{
              background: theme.backgroundSecondary,
              border: `1px solid ${theme.borderLight}`,
              borderRadius: radius.md,
              padding: spacing.lg,
              margin: '10px 0',
              overflowX: 'auto',
              fontSize: '0.85em',
              lineHeight: '1.5',
            }}>{children}</pre>
          ),

          // Blockquote
          blockquote: ({ children }) => (
            <blockquote style={{
              borderLeft: `3px solid ${theme.accent}`,
              margin: '10px 0',
              paddingLeft: '14px',
              color: theme.textMuted,
              fontStyle: 'italic',
              overflowWrap: 'anywhere',
              wordBreak: 'break-word',
            }}>{children}</blockquote>
          ),

          // Horizontal rule
          hr: () => (
            <hr style={{
              border: 'none',
              borderTop: `1px solid ${theme.borderLight}`,
              margin: `${spacing.xl} 0`,
            }} />
          ),

          // Table
          table: ({ children }) => (
            <div style={{ overflowX: 'auto', margin: '10px 0', maxWidth: '100%' }}>
              <table style={{
                borderCollapse: 'collapse',
                minWidth: '100%',
                width: 'max-content',
                fontSize: '0.88em',
              }}>{children}</table>
            </div>
          ),
          thead: ({ children }) => (
            <thead style={{
              borderBottom: `2px solid ${theme.borderLight}`,
            }}>{children}</thead>
          ),
          th: ({ children }) => (
            <th style={{
              padding: `${spacing.md} 14px`,
              textAlign: 'left',
              fontWeight: fontWeight.semibold,
              color: theme.text,
              borderBottom: `1px solid ${theme.borderLight}`,
              whiteSpace: 'nowrap',
            }}>{children}</th>
          ),
          td: ({ children }) => (
            <td style={{
              padding: `${spacing.sm} 14px`,
              borderBottom: `1px solid ${theme.borderLight}`,
              color: theme.textSecondary,
              minWidth: '100px',
            }}>{children}</td>
          ),
        }}
      >
        {cleanedContent}
      </ReactMarkdown>
    </div>
  )
}

export default MarkdownRenderer
