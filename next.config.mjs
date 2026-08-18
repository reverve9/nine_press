/** @type {import('next').NextConfig} */
export default {
  // playwright 는 네이티브 바이너리를 들고 있다. 번들러가 삼키면 터진다.
  serverExternalPackages: ['playwright'],

  // 이 도구는 dev 전용이다. next build 를 돌리지 않는다.
  // (sclocalfood 에서 dev 서버가 뜬 채 build 를 돌려 .next 가 깨진 적이 있다)
};
