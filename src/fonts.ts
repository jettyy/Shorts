import { continueRender, delayRender, staticFile } from 'remotion';

/**
 * Pretendard(한글) 폰트를 로컬 public/fonts 에서 직접 로드한다.
 * 외부 CDN을 타지 않으므로 오프라인/사내망에서도 동일하게 렌더링된다.
 * 파일은 `npm install` 시 scripts/setup-fonts.mjs 가 node_modules에서 복사해 둔다.
 */
const FACES: { file: string; weight: string }[] = [
  { file: 'fonts/Pretendard-Medium.woff2', weight: '500' },
  { file: 'fonts/Pretendard-Bold.woff2', weight: '700' },
  { file: 'fonts/Pretendard-ExtraBold.woff2', weight: '800' },
  { file: 'fonts/Pretendard-Black.woff2', weight: '900' },
];

const handle = delayRender('Pretendard 폰트 로딩');

Promise.all(
  FACES.map(async ({ file, weight }) => {
    const face = new FontFace('Pretendard', `url(${staticFile(file)}) format('woff2')`, {
      weight,
      style: 'normal',
    });
    const loaded = await face.load();
    document.fonts.add(loaded);
  }),
)
  .then(() => continueRender(handle))
  .catch((err) => {
    // 폰트가 없더라도 렌더가 멈추지 않도록 폴백 폰트로 진행한다.
    console.warn('[fonts] Pretendard 로딩 실패, 시스템 폰트로 대체합니다.', err);
    continueRender(handle);
  });

export const FONTS_READY = true;
