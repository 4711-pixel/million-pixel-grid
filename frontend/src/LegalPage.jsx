import React from 'react';
import ReactMarkdown from 'react-markdown';
import { colors, fonts } from './theme.js';

export default function LegalPage({ markdown, onBack }) {
  return (
    <div style={{ fontFamily: fonts.body, color: colors.ink, background: colors.cream, minHeight: '100vh', padding: '32px 20px' }}>
      <div style={{ maxWidth: '760px', margin: '0 auto', background: colors.white, border: `1px solid ${colors.border}`, borderRadius: '14px', padding: '32px 40px 40px' }}>
        <button
          onClick={onBack}
          style={{ background: 'none', border: 'none', color: colors.muted, fontSize: '13px', cursor: 'pointer', padding: 0, marginBottom: '20px' }}
        >
          ← Zurück zum Grid
        </button>
        <div className="legal-content">
          <ReactMarkdown
            components={{
              h1: ({ node, ...props }) => <h1 style={{ fontFamily: fonts.display, fontSize: '26px', fontWeight: 600, color: colors.ink, marginTop: 0 }} {...props} />,
              h2: ({ node, ...props }) => <h2 style={{ fontSize: '17px', fontWeight: 600, color: colors.ink, marginTop: '28px' }} {...props} />,
              p: ({ node, ...props }) => <p style={{ fontSize: '14px', color: colors.ink, lineHeight: 1.7 }} {...props} />,
              li: ({ node, ...props }) => <li style={{ fontSize: '14px', color: colors.ink, lineHeight: 1.7 }} {...props} />,
              a: ({ node, ...props }) => <a style={{ color: colors.accent }} {...props} />,
              strong: ({ node, ...props }) => <strong style={{ color: colors.ink }} {...props} />
            }}
          >
            {markdown}
          </ReactMarkdown>
        </div>
      </div>
    </div>
  );
}
