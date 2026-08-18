import './globals.css';

export const metadata = {
  title: 'nine_press',
  description: '판면 규칙 기반 문서 조판',
};

export default function RootLayout({ children }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
