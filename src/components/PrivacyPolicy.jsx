import React, { useEffect } from 'react'
import { motion } from 'framer-motion'
import { ArrowLeft } from 'lucide-react'
import { getTheme } from '../utils/theme'

const PrivacyPolicy = ({ onNavigate }) => {
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
            Privacy Policy
          </h1>
          <p style={{
            color: 'rgba(255, 255, 255, 0.4)',
            fontSize: '0.9rem',
            marginBottom: '48px',
          }}>
            Last updated: {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
          </p>

          <div style={sectionStyle}>
            <h2 style={headingStyle}>1. Introduction</h2>
            <p style={paragraphStyle}>
              ArkitekAI ("we," "us," or "our") is committed to protecting your privacy. This Privacy Policy 
              explains how we collect, use, store, and share your information when you use the ArkitekAI 
              platform ("the Service"). By using the Service, you consent to the practices described in this policy.
            </p>
          </div>

          <div style={sectionStyle}>
            <h2 style={headingStyle}>2. Information We Collect</h2>
            
            <h3 style={{ ...headingStyle, fontSize: '1.1rem', marginTop: '16px' }}>2.1 Account Information</h3>
            <p style={paragraphStyle}>
              When you create an account, we collect:
            </p>
            <ul style={listStyle}>
              <li>First and last name</li>
              <li>Email address</li>
              <li>Username</li>
              <li>Password (stored securely using industry-standard hashing)</li>
            </ul>

            <h3 style={{ ...headingStyle, fontSize: '1.1rem', marginTop: '16px' }}>2.2 Usage Data</h3>
            <p style={paragraphStyle}>
              When you use the Service, we collect:
            </p>
            <ul style={listStyle}>
              <li>Prompts you submit to AI models</li>
              <li>AI model responses generated for your prompts</li>
              <li>Model selections and preferences</li>
              <li>Token usage and API consumption metrics</li>
              <li>Conversation history for follow-up conversations</li>
              <li>Saved conversations and Prompt Feed posts</li>
            </ul>

            <h3 style={{ ...headingStyle, fontSize: '1.1rem', marginTop: '16px' }}>2.3 Payment Information</h3>
            <p style={paragraphStyle}>
              Payment processing is handled entirely by Stripe. We do not store your full credit card number, 
              CVV, or other sensitive payment details on our servers. Stripe may share limited information with 
              us (such as the last four digits of your card, card type, and billing address) for transaction 
              records and customer support purposes.
            </p>

            <h3 style={{ ...headingStyle, fontSize: '1.1rem', marginTop: '16px' }}>2.4 Automatically Collected Information</h3>
            <p style={paragraphStyle}>
              We may automatically collect certain technical information, including browser type, device type, 
              and general usage patterns. We do not use third-party tracking cookies or advertising trackers.
            </p>
          </div>

          <div style={sectionStyle}>
            <h2 style={headingStyle}>3. How We Use Your Information</h2>
            <p style={paragraphStyle}>
              We use the information we collect to:
            </p>
            <ul style={listStyle}>
              <li>Provide, operate, and maintain the Service</li>
              <li>Process your subscriptions and payments</li>
              <li>Send your prompts to third-party AI model providers and return their responses</li>
              <li>Maintain conversation context for follow-up messages</li>
              <li>Display your saved conversations and Prompt Feed posts</li>
              <li>Track usage for billing and service management</li>
              <li>Send you important service-related communications (e.g., password resets, subscription updates)</li>
              <li>Improve the Service and fix bugs</li>
              <li>Prevent fraud and enforce our Terms of Service</li>
            </ul>
          </div>

          <div style={sectionStyle}>
            <h2 style={headingStyle}>4. Third-Party Services</h2>
            <p style={paragraphStyle}>
              To provide the Service, we share certain data with the following third-party providers:
            </p>
            <ul style={listStyle}>
              <li><strong>AI Model Providers:</strong> OpenAI, Anthropic, Google, and xAI receive your prompts in order to generate responses. These providers have their own privacy policies governing how they handle data sent to their APIs</li>
              <li><strong>Stripe:</strong> Handles all payment processing. Stripe's privacy policy governs how your payment data is handled</li>
              <li><strong>Serper:</strong> Provides web search results when our RAG pipeline is activated. Search queries derived from your prompts may be sent to Serper</li>
              <li><strong>MongoDB:</strong> Used for data storage. Your account data, conversation history, and usage metrics are stored in our database</li>
              <li><strong>Vercel:</strong> Hosts our application. Standard server logs may be generated during normal operation</li>
            </ul>
            <p style={paragraphStyle}>
              We do not sell, rent, or trade your personal information to any third parties for marketing or 
              advertising purposes.
            </p>
          </div>

          <div style={sectionStyle}>
            <h2 style={headingStyle}>5. Data Storage & Security</h2>
            <p style={paragraphStyle}>
              We take reasonable measures to protect your information, including:
            </p>
            <ul style={listStyle}>
              <li>Passwords are hashed using industry-standard algorithms before storage</li>
              <li>All data transmission between your browser and our servers uses HTTPS encryption</li>
              <li>Payment processing is handled by PCI-compliant Stripe infrastructure</li>
              <li>Access to our databases is restricted and protected by authentication</li>
            </ul>
            <p style={paragraphStyle}>
              While we strive to protect your information, no method of electronic storage or transmission 
              is 100% secure. We cannot guarantee absolute security.
            </p>
          </div>

          <div style={sectionStyle}>
            <h2 style={headingStyle}>6. Data Retention</h2>
            <p style={paragraphStyle}>
              We retain your account information and usage data for as long as your account is active or as 
              needed to provide the Service. If you delete your account, we will delete or anonymize your 
              personal data within a reasonable timeframe, except where we are required by law to retain it. 
              Conversation context used for follow-up conversations is temporary and is cleared when you 
              start a new conversation, clear your session, or sign out.
            </p>
          </div>

          <div style={sectionStyle}>
            <h2 style={headingStyle}>7. Your Rights</h2>
            <p style={paragraphStyle}>
              Depending on your location, you may have certain rights regarding your personal data, including:
            </p>
            <ul style={listStyle}>
              <li><strong>Access:</strong> You can request a copy of the personal data we hold about you</li>
              <li><strong>Correction:</strong> You can request that we correct inaccurate information</li>
              <li><strong>Deletion:</strong> You can request that we delete your account and personal data</li>
              <li><strong>Portability:</strong> You can request your data in a structured, machine-readable format</li>
            </ul>
            <p style={paragraphStyle}>
              To exercise any of these rights, please contact us at{' '}
              <span style={{ color: currentTheme.accent }}>support@arkitekai.com</span>.
            </p>
          </div>

          <div style={sectionStyle}>
            <h2 style={headingStyle}>8. Community Content</h2>
            <p style={paragraphStyle}>
              If you post content to the ArkitekAI Prompt Feed, that content (including your username, prompt 
              text, AI responses, and any description you provide) will be visible to other users of the Service. 
              You can delete your Prompt Feed posts at any time. We encourage you not to include personal or 
              sensitive information in prompts you share publicly.
            </p>
          </div>

          <div style={sectionStyle}>
            <h2 style={headingStyle}>9. Children's Privacy</h2>
            <p style={paragraphStyle}>
              ArkitekAI is not directed to children under the age of 13 (or the applicable age of consent in 
              your jurisdiction). We do not knowingly collect personal information from children. If we become 
              aware that we have collected personal information from a child, we will take steps to delete 
              that information.
            </p>
          </div>

          <div style={sectionStyle}>
            <h2 style={headingStyle}>10. Changes to This Policy</h2>
            <p style={paragraphStyle}>
              We may update this Privacy Policy from time to time. We will notify users of material changes by 
              updating the "Last updated" date at the top of this page. Your continued use of the Service after 
              changes are posted constitutes acceptance of the updated policy.
            </p>
          </div>

          <div style={sectionStyle}>
            <h2 style={headingStyle}>11. Contact Us</h2>
            <p style={paragraphStyle}>
              If you have questions or concerns about this Privacy Policy or our data practices, please contact us at:
            </p>
            <p style={paragraphStyle}>
              <span style={{ color: currentTheme.accent }}>support@arkitekai.com</span>
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
              onClick={() => onNavigate('terms')}
              style={{
                background: 'none',
                border: 'none',
                color: 'rgba(255, 255, 255, 0.4)',
                fontSize: '0.85rem',
                cursor: 'pointer',
              }}
            >
              Terms of Service
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

export default PrivacyPolicy

