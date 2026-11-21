export default function SocialIcon({ provider }: { provider: 'google' | 'telegram' }) {
  return <svg className="social-icon" viewBox="0 0 24 24" width="21" height="21" aria-hidden="true" focusable="false">
    {provider === 'telegram'
      ? <path fill="currentColor" d="M21.4 3.2 18.2 20c-.2 1.2-.9 1.5-1.9.9l-4.9-3.6-2.4 2.3c-.3.3-.5.5-1 .5l.4-5.1L17.7 6c.4-.4-.1-.6-.6-.3L5.6 13 1.8 11.8c-1.2-.4-1.2-1.2.3-1.8L20 3.1c.8-.3 1.5.2 1.4.1Z"/>
      : <><path fill="#4285f4" d="M21.6 12.2c0-.7-.1-1.4-.2-2.1H12v4h5.4a4.6 4.6 0 0 1-2 3v2.5h3.3c2-1.8 2.9-4.4 2.9-7.4Z"/><path fill="#34a853" d="M12 22c2.7 0 5-.9 6.7-2.4l-3.3-2.5c-.9.6-2 1-3.4 1a6 6 0 0 1-5.6-4.1H3v2.6A10 10 0 0 0 12 22Z"/><path fill="#fbbc05" d="M6.4 14a6 6 0 0 1 0-4V7.4H3a10 10 0 0 0 0 9.2L6.4 14Z"/><path fill="#ea4335" d="M12 5.9c1.5 0 2.8.5 3.8 1.5l2.9-2.8A9.7 9.7 0 0 0 12 2a10 10 0 0 0-9 5.4L6.4 10A6 6 0 0 1 12 5.9Z"/></>}
  </svg>
}
