import { ImageResponse } from 'next/og';

export const SOCIAL_IMAGE_ALT = 'Echo Heist — a ghost-replay stealth puzzle';
export const SOCIAL_IMAGE_SIZE = { width: 1200, height: 630 };
export const SOCIAL_IMAGE_TYPE = 'image/png';

export function socialImageResponse(): ImageResponse {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          background: '#0f1020',
          color: '#e6e2d3',
          fontFamily: 'monospace',
          padding: 56,
          border: '12px solid #303b52',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 18, height: 18, background: '#f2b94b' }} />
          <div
            style={{
              display: 'flex',
              fontSize: 24,
              letterSpacing: 8,
              color: '#3fc7b4',
              fontWeight: 700,
            }}
          >
            ECHO HEIST
          </div>
        </div>

        <div style={{ display: 'flex', flex: 1, alignItems: 'center', gap: 56 }}>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              flex: 1,
              gap: 20,
            }}
          >
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                fontSize: 104,
                lineHeight: 0.92,
                fontWeight: 700,
                letterSpacing: -2,
              }}
            >
              <span>OUTRUN</span>
              <span style={{ color: '#3fc7b4' }}>YOUR PAST</span>
              <span>RUNS.</span>
            </div>
            <div style={{ display: 'flex', fontSize: 28, color: '#55637d', lineHeight: 1.35 }}>
              Every failed run becomes a ghost. Bank three lives, press the plates and crack
              the vault.
            </div>
          </div>

          <div
            style={{
              width: 360,
              height: 360,
              display: 'flex',
              position: 'relative',
              background: '#1c2436',
              border: '8px solid #303b52',
            }}
          >
            <div
              style={{
                position: 'absolute',
                left: 36,
                top: 36,
                width: 48,
                height: 48,
                background: '#3fc7b4',
                opacity: 0.55,
              }}
            />
            <div
              style={{
                position: 'absolute',
                right: 42,
                top: 150,
                width: 48,
                height: 48,
                background: '#f2b94b',
                opacity: 0.55,
              }}
            />
            <div
              style={{
                position: 'absolute',
                left: 130,
                bottom: 42,
                width: 48,
                height: 48,
                background: '#e0455a',
                opacity: 0.55,
              }}
            />
            <div
              style={{
                position: 'absolute',
                left: 132,
                top: 82,
                width: 44,
                height: 52,
                display: 'flex',
                background: '#e6e2d3',
              }}
            />
            <div
              style={{
                position: 'absolute',
                left: 146,
                top: 100,
                width: 6,
                height: 8,
                background: '#0f1020',
              }}
            />
            <div
              style={{
                position: 'absolute',
                left: 162,
                top: 100,
                width: 6,
                height: 8,
                background: '#0f1020',
              }}
            />
            <div
              style={{
                position: 'absolute',
                left: 238,
                top: 238,
                width: 28,
                height: 28,
                background: '#3fc7b4',
                transform: 'rotate(45deg)',
              }}
            />
            <div
              style={{
                position: 'absolute',
                left: 248,
                top: 248,
                width: 8,
                height: 8,
                background: '#e6e2d3',
              }}
            />
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            color: '#55637d',
            fontSize: 22,
            letterSpacing: 4,
          }}
        >
          <span>DETERMINISTIC GHOST REPLAYS</span>
          <span>PLAY IN YOUR BROWSER</span>
        </div>
      </div>
    ),
    SOCIAL_IMAGE_SIZE,
  );
}
