import React, { useEffect } from 'react'
import { motion } from 'framer-motion'
import { ArrowLeft } from 'lucide-react'
import { getTheme } from '../utils/theme'

const TermsOfService = ({ onNavigate }) => {
  const currentTheme = getTheme('dark')

  // Allow page scrolling (body & #root normally have overflow:hidden)
  useEffect(() => {
    document.body.style.overflow = 'auto'
    document.getElementById('root').style.overflow = 'auto'
    document.getElementById('root').style.height = 'auto'
    return () => {
      document.body.style.overflow = 'hidden'
      document.getElementById('root').style.overflow = 'hidden'
      document.getElementById('root').style.height = '100vh'
    }
  }, [])

  const sectionStyle = {
    marginBottom: '32px',
  }

  const headingStyle = {
    fontSize: '1.3rem',
    fontWeight: 600,
    marginBottom: '12px',
    color: currentTheme.text,
  }

  const paragraphStyle = {
    color: 'rgba(255, 255, 255, 0.6)',
    lineHeight: 1.8,
    fontSize: '0.95rem',
    marginBottom: '12px',
  }

  const listStyle = {
    color: 'rgba(255, 255, 255, 0.6)',
    lineHeight: 1.8,
    fontSize: '0.95rem',
    paddingLeft: '24px',
    marginBottom: '12px',
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #0a0a0a 0%, #1a1a2e 50%, #0a0a0a 100%)',
      color: '#ffffff',
      padding: '40px',
    }}>
      <div style={{ maxWidth: '800px', margin: '0 auto' }}>
        {/* Back button */}
        <button
          onClick={() => onNavigate('landing')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            background: 'none',
            border: 'none',
            color: currentTheme.accent,
            fontSize: '0.95rem',
            cursor: 'pointer',
            marginBottom: '40px',
            padding: 0,
          }}
        >
          <ArrowLeft size={18} />
          Back to Home
        </button>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <h1 style={{
            fontSize: '2.5rem',
            fontWeight: 700,
            marginBottom: '8px',
            background: currentTheme.accentGradient,
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            display: 'inline-block',
          }}>
            Terms of Service
          </h1>
          <p style={{
            color: 'rgba(255, 255, 255, 0.4)',
            fontSize: '0.9rem',
            marginBottom: '48px',
          }}>
            Last updated: {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
          </p>

          <div style={sectionStyle}>
            <h2 style={headingStyle}>1. Acceptance of Terms</h2>
            <p style={paragraphStyle}>
              By accessing or using ArkitekAI ("the Service"), you agree to be bound by these Terms of Service. 
              If you do not agree to these terms, you may not use the Service.
            </p>
          </div>

          <div style={sectionStyle}>
            <h2 style={headingStyle}>2. Description of Service</h2>
            <p style={paragraphStyle}>
              ArkitekAI is an AI-powered platform that allows users to:
            </p>
            <ul style={listStyle}>
              <li>Send prompts to multiple large language models (LLMs) simultaneously, including models from OpenAI (ChatGPT), Anthropic (Claude), Google (Gemini), and xAI (Grok)</li>
              <li>Compare responses from different AI models side by side</li>
              <li>Receive AI-generated consensus summaries from a judge model</li>
              <li>Access real-time web search results integrated into AI responses via our RAG (Retrieval-Augmented Generation) pipeline</li>
              <li>Save and revisit conversations</li>
              <li>Continue follow-up conversations with individual models</li>
            </ul>
          </div>

          <div style={sectionStyle}>
            <h2 style={headingStyle}>3. Account Registration</h2>
            <p style={paragraphStyle}>
              To use ArkitekAI, you must create an account by providing your first name, last name, email address, 
              a username, and a password. You are responsible for maintaining the confidentiality of your account 
              credentials and for all activities that occur under your account. You must notify us immediately of 
              any unauthorized use of your account.
            </p>
          </div>

          <div style={sectionStyle}>
            <h2 style={headingStyle}>4. Plans & Billing</h2>
            <p style={paragraphStyle}>
              ArkitekAI offers both a free tier and a paid Pro subscription.
            </p>
            <ul style={listStyle}>
              <li><strong>Free Tier:</strong> All users can access the Service with limited usage at no cost</li>
              <li><strong>Pro Subscription:</strong> $19.95 per month, which includes increased usage limits and additional features</li>
              <li><strong>Usage Allocation:</strong> Each Pro subscription includes a significantly higher monthly usage allocation (15x more than the free tier) toward AI model API costs</li>
              <li><strong>Billing:</strong> Pro subscriptions are billed monthly via Stripe. By subscribing, you authorize us to charge your payment method on a recurring basis</li>
              <li><strong>Cancellation:</strong> You may cancel or pause your Pro subscription at any time. Upon cancellation or pausing, you will retain full access until the end of your current billing period</li>
              <li><strong>Refunds:</strong> Subscription fees are non-refundable except as required by applicable law. If you cancel before the end of your billing period, you will not be charged for the next period</li>
            </ul>
            <p style={paragraphStyle}>
              All payments are processed securely through Stripe. We do not store your full payment card information on our servers.
            </p>
          </div>

          <div style={sectionStyle}>
            <h2 style={headingStyle}>5. Acceptable Use</h2>
            <p style={paragraphStyle}>
              You agree not to use ArkitekAI to:
            </p>
            <ul style={listStyle}>
              <li>Generate, distribute, or promote illegal, harmful, abusive, or fraudulent content</li>
              <li>Harass, threaten, or impersonate others</li>
              <li>Attempt to circumvent usage limits, abuse API resources, or interfere with the Service's infrastructure</li>
              <li>Use the Service for any purpose that violates applicable laws or regulations</li>
              <li>Share your account credentials with others or allow unauthorized access to your account</li>
              <li>Scrape, crawl, or automated-extract data from the Service without express written permission</li>
            </ul>
            <p style={paragraphStyle}>
              We reserve the right to suspend or terminate your account if we determine, in our sole discretion, 
              that you have violated these terms.
            </p>
          </div>

          <div style={sectionStyle}>
            <h2 style={headingStyle}>6. AI-Generated Content</h2>
            <p style={paragraphStyle}>
              Responses provided by AI models through ArkitekAI are generated by third-party AI systems (OpenAI, 
              Anthropic, Google, xAI, and others). We do not guarantee the accuracy, completeness, or reliability 
              of AI-generated content. AI responses should not be treated as professional advice (legal, medical, 
              financial, or otherwise). You are solely responsible for how you use AI-generated content.
            </p>
          </div>

          <div style={sectionStyle}>
            <h2 style={headingStyle}>7. Web Search Results</h2>
            <p style={paragraphStyle}>
              ArkitekAI may automatically search the web to provide AI models with current information. Search results 
              are sourced from third-party search providers and websites. We do not control, endorse, or guarantee 
              the accuracy of third-party content. Sources are provided for reference, and you should independently 
              verify any critical information.
            </p>
          </div>

          {/* DISABLED: Community Features section temporarily removed (social media feature)
          <div style={sectionStyle}>
            <h2 style={headingStyle}>8. Community Features & Prompt Feed</h2>
            <p style={paragraphStyle}>
              ArkitekAI includes a Prompt Feed where users can share prompts and AI responses. By posting 
              content to the Prompt Feed, you grant ArkitekAI a non-exclusive, royalty-free license to display that 
              content to other users of the Service. You may delete your posts at any time. You are responsible for 
              the content you share and must not post content that is illegal or violates the rights of others.
            </p>
          </div>
          */}

          <div style={sectionStyle}>
            <h2 style={headingStyle}>9. Intellectual Property</h2>
            <p style={paragraphStyle}>
              The ArkitekAI platform, including its design, code, features, and branding, is the property of 
              ArkitekAI. You retain ownership of any original prompts you submit. AI-generated responses are 
              subject to the terms of the respective AI model providers (OpenAI, Anthropic, Google, xAI).
            </p>
          </div>

          <div style={sectionStyle}>
            <h2 style={headingStyle}>10. Limitation of Liability</h2>
            <p style={paragraphStyle}>
              To the maximum extent permitted by applicable law, ArkitekAI and its operators shall not be liable 
              for any indirect, incidental, special, consequential, or punitive damages, or any loss of profits 
              or revenues, whether incurred directly or indirectly, or any loss of data, use, goodwill, or other 
              intangible losses resulting from:
            </p>
            <ul style={listStyle}>
              <li>Your use of or inability to use the Service</li>
              <li>Any AI-generated content or web search results provided through the Service</li>
              <li>Unauthorized access to or use of our servers and/or any personal information stored therein</li>
              <li>Service interruptions, downtime, or errors</li>
            </ul>
          </div>

          <div style={sectionStyle}>
            <h2 style={headingStyle}>11. Service Availability</h2>
            <p style={paragraphStyle}>
              We strive to maintain continuous availability of the Service but do not guarantee uninterrupted 
              access. The Service may be temporarily unavailable due to maintenance, updates, or circumstances 
              beyond our control. Third-party AI model providers may also experience downtime or changes that 
              affect the Service.
            </p>
          </div>

          <div style={sectionStyle}>
            <h2 style={headingStyle}>12. Changes to Terms</h2>
            <p style={paragraphStyle}>
              We may update these Terms of Service from time to time. We will notify users of material changes 
              by updating the "Last updated" date at the top of this page. Your continued use of the Service 
              after changes are posted constitutes acceptance of the updated terms.
            </p>
          </div>

          <div style={sectionStyle}>
            <h2 style={headingStyle}>13. Termination</h2>
            <p style={paragraphStyle}>
              We reserve the right to suspend or terminate your account and access to the Service at our discretion, 
              with or without cause, and with or without notice. Upon termination, your right to use the Service 
              will cease immediately. Provisions that by their nature should survive termination shall survive.
            </p>
          </div>

          <div style={sectionStyle}>
            <h2 style={headingStyle}>14. Contact</h2>
            <p style={paragraphStyle}>
              If you have questions about these Terms of Service, please contact us at{' '}
              <span style={{ color: currentTheme.accent }}>support@arkitekai.com</span>.
            </p>
          </div>
        </motion.div>

        {/* Footer */}
        <div style={{
          marginTop: '60px',
          paddingTop: '24px',
          borderTop: '1px solid rgba(255, 255, 255, 0.06)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px',
        }}>
          <span style={{ color: 'rgba(255, 255, 255, 0.3)', fontSize: '0.85rem' }}>
            ArkitekAI &copy; {new Date().getFullYear()}
          </span>
          <div style={{ display: 'flex', gap: '20px' }}>
            <button
              onClick={() => onNavigate('privacy')}
              style={{
                background: 'none',
                border: 'none',
                color: 'rgba(255, 255, 255, 0.4)',
                fontSize: '0.85rem',
                cursor: 'pointer',
              }}
            >
              Privacy Policy
            </button>
            <button
              onClick={() => onNavigate('landing')}
              style={{
                background: 'none',
                border: 'none',
                color: 'rgba(255, 255, 255, 0.4)',
                fontSize: '0.85rem',
                cursor: 'pointer',
              }}
            >
              Home
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default TermsOfService

