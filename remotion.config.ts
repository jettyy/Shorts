import { Config } from '@remotion/cli/config';

Config.setVideoImageFormat('jpeg');
Config.setOverwriteOutput(true);
// 렌더 품질: 낮을수록 고화질(0~51). 18은 쇼츠용으로 충분히 선명하다.
Config.setCrf(18);
Config.setPixelFormat('yuv420p');
Config.setCodec('h264');
// public/ 안의 폰트를 staticFile()로 읽는다.
Config.setPublicDir('public');
