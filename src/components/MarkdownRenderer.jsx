import React from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import 'katex/dist/katex.min.css'

/**
 * Reusable markdown renderer that styles markdown content
 * to match the app's theme. Used for model responses, conversation
 * history, and saved conversations.
 */
const MarkdownRenderer = ({ content, theme, fontSize = '0.9rem', lineHeight = '1.7' }) => {
  if (!content) return null

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
              fontWeight: '700',
              color: theme.text,
              margin: '20px 0 10px 0',
              paddingBottom: '6px',
              borderBottom: `1px solid ${theme.borderLight}`,
            }}>{children}</h1>
          ),
          h2: ({ children }) => (
            <h2 style={{
              fontSize: '1.2em',
              fontWeight: '700',
              color: theme.text,
              margin: '18px 0 8px 0',
              paddingBottom: '4px',
              borderBottom: `1px solid ${theme.borderLight}`,
            }}>{children}</h2>
          ),
          h3: ({ children }) => (
            <h3 style={{
              fontSize: '1.05em',
              fontWeight: '600',
              color: theme.text,
              margin: '14px 0 6px 0',
            }}>{children}</h3>
          ),
          h4: ({ children }) => (
            <h4 style={{
              fontSize: '1em',
              fontWeight: '600',
              color: theme.text,
              margin: '12px 0 4px 0',
            }}>{children}</h4>
          ),

          // Paragraphs
          p: ({ children }) => (
            <p style={{
              margin: '8px 0',
              color: theme.textSecondary,
              lineHeight,
              overflowWrap: 'anywhere',
              wordBreak: 'break-word',
            }}>{children}</p>
          ),

          // Bold and italic
          strong: ({ children }) => (
            <strong style={{ color: theme.text, fontWeight: '600' }}>{children}</strong>
          ),
          em: ({ children }) => (
            <em style={{ color: theme.textSecondary }}>{children}</em>
          ),

          // Lists
          ul: ({ children }) => (
            <ul style={{
              margin: '6px 0',
              paddingLeft: '20px',
              listStyleType: 'disc',
            }}>{children}</ul>
          ),
          ol: ({ children }) => (
            <ol style={{
              margin: '6px 0',
              paddingLeft: '20px',
            }}>{children}</ol>
          ),
          li: ({ children }) => (
            <li style={{
              margin: '4px 0',
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
              onMouseEnter={(e) => { e.target.style.textDecoration = 'underline' }}
              onMouseLeave={(e) => { e.target.style.textDecoration = 'none' }}
            >{children}</a>
          ),

          // Code (inline and block)
          code: ({ inline, className, children }) => {
            if (inline) {
              return (
                <code style={{
                  background: theme.buttonBackground,
                  border: `1px solid ${theme.borderLight}`,
                  borderRadius: '4px',
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
              borderRadius: '8px',
              padding: '12px',
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
              margin: '16px 0',
            }} />
          ),

          // Table
          table: ({ children }) => (
            <div style={{ overflowX: 'auto', margin: '10px 0' }}>
              <table style={{
                borderCollapse: 'collapse',
                width: '100%',
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
              padding: '8px 12px',
              textAlign: 'left',
              fontWeight: '600',
              color: theme.text,
              borderBottom: `1px solid ${theme.borderLight}`,
            }}>{children}</th>
          ),
          td: ({ children }) => (
            <td style={{
              padding: '6px 12px',
              borderBottom: `1px solid ${theme.borderLight}`,
              color: theme.textSecondary,
              overflowWrap: 'anywhere',
              wordBreak: 'break-word',
            }}>{children}</td>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}

export default MarkdownRenderer

