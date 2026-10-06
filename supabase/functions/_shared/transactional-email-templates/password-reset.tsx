/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Html, Preview, Text, Section, Hr, Button, Link,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = 'Check-iN'

interface PasswordResetProps {
  name?: string
  resetUrl?: string
}

const PasswordResetEmail = ({ name, resetUrl }: PasswordResetProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Your {SITE_NAME} sign-in link</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={logoSection}>
          <div style={logoBadge}>C-iN</div>
        </Section>

        <Heading style={h1}>Sign-in link</Heading>

        <Text style={text}>
          Hello{name ? ` ${name}` : ''},
        </Text>

        <Text style={text}>
          A new sign-in link was requested for your {SITE_NAME} account. Use the
          button below to sign in. This link can be used once and expires in one hour.
        </Text>

        {resetUrl ? (
          <Section style={buttonWrap}>
            <Button href={resetUrl} style={button}>
              Sign in to {SITE_NAME}
            </Button>
          </Section>
        ) : null}

        {resetUrl ? (
          <Text style={smallNote}>
            If the button doesn't work, copy this link into your browser:
            <br />
            <Link href={resetUrl} style={contactLink}>{resetUrl}</Link>
          </Text>
        ) : null}

        <Text style={text}>
          Didn't ask for this? You can safely ignore this email — your account
          stays protected and nothing changes.
        </Text>

        <Hr style={divider} />

        <Section style={contactBox}>
          <Text style={contactTitle}>Questions?</Text>
          <Text style={contactRow}>
            📧 Email: <Link href="mailto:checkin_support@futurewave.in" style={contactLink}>checkin_support@futurewave.in</Link>
          </Text>
          <Text style={contactRow}>
            📞 Contact Center: <Link href="tel:+917045868482" style={contactLink}>+91 7045868482</Link>
          </Text>
        </Section>

        <Hr style={divider} />

        <Text style={footerText}>
          {SITE_NAME} — Personal Emergency Response System
          <br />
          Future Wave Technologies Pvt. Ltd.
        </Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: PasswordResetEmail,
  subject: `Your ${SITE_NAME} sign-in link`,
  displayName: 'Password / sign-in reset link',
  previewData: { name: 'Jane', resetUrl: 'https://iamgood.lovable.app/' },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif' }
const container = { padding: '20px 25px', maxWidth: '600px', margin: '0 auto' }
const logoSection: React.CSSProperties = { textAlign: 'center' as const, marginBottom: '24px' }
const logoBadge: React.CSSProperties = {
  display: 'inline-block',
  width: '60px',
  height: '60px',
  borderRadius: '50%',
  backgroundColor: '#1a365d',
  color: '#ffffff',
  lineHeight: '60px',
  textAlign: 'center' as const,
  fontWeight: 'bold',
  fontSize: '14px',
}
const h1 = { fontSize: '24px', fontWeight: 'bold' as const, color: '#1a365d', margin: '0 0 20px', textAlign: 'center' as const }
const text = { fontSize: '15px', color: '#333333', lineHeight: '1.6', margin: '0 0 16px' }
const buttonWrap: React.CSSProperties = { textAlign: 'center' as const, margin: '24px 0' }
const button: React.CSSProperties = {
  backgroundColor: '#1a365d',
  borderRadius: '12px',
  color: '#ffffff',
  fontSize: '16px',
  fontWeight: 'bold' as const,
  textDecoration: 'none',
  padding: '12px 24px',
  display: 'inline-block',
}
const smallNote = { fontSize: '12px', color: '#777777', lineHeight: '1.5', margin: '0 0 16px', wordBreak: 'break-all' as const }
const contactBox: React.CSSProperties = {
  backgroundColor: '#f8fafc',
  border: '1px solid #e2e8f0',
  padding: '16px',
  margin: '16px 0',
  borderRadius: '6px',
}
const contactTitle = { fontSize: '14px', fontWeight: 'bold' as const, color: '#1a365d', margin: '0 0 10px' }
const contactRow = { fontSize: '14px', color: '#333333', lineHeight: '1.6', margin: '0 0 4px' }
const contactLink = { color: '#1a365d', textDecoration: 'underline' }
const divider = { borderColor: '#e5e5e5', margin: '28px 0 16px' }
const footerText = { fontSize: '12px', color: '#999999', textAlign: 'center' as const, margin: '0' }
