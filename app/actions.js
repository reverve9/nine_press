'use server';

// ⚠ 이 파일은 async 함수만 export 한다.
//    상수·객체를 같이 내보내면 빌드가 아니라 그 화면을 실제로 열 때 터진다.

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { loadDoc, saveDoc, docMtime } from './lib/docs.js';

const run = promisify(execFile);
const ROOT = process.cwd();

async function exec(args) {
  try {
    const { stdout, stderr } = await run('node', args, { cwd: ROOT, timeout: 120_000 });
    return { ok: true, log: (stdout + stderr).trim() };
  } catch (e) {
    return { ok: false, log: (e.stdout ?? '') + (e.stderr ?? e.message) };
  }
}

export async function 빌드(slug, embed = false) {
  const src = path.join('content', `${slug}.json`);
  return exec(['scripts/build.js', src, ...(embed ? ['--embed'] : [])]);
}

export async function PDF(slug) {
  const src = path.join('content', `${slug}.json`);
  const built = await exec(['scripts/build.js', src]);
  if (!built.ok) return built;
  const name = slug.split('/').pop();
  return exec(['scripts/pdf.js', path.join('out/html', `${name}.html`)]);
}

// 문안 저장 — 화면이 들고 있던 doc 을 통째로 쓴다.
// 통째로 쓰되 기준시각을 대조하므로, 챗 세션이 같은 파일을 고친 뒤라면 거부된다.
export async function 문안저장(slug, 기준시각, doc) {
  try {
    const 현재 = docMtime(slug);
    if (기준시각 && Math.abs(현재 - 기준시각) > 1) {
      return { ok: false, 사유: '이 화면 밖에서 파일이 바뀌었다. 다시 불러온 뒤 고친다.', mtime: 현재 };
    }
    if (!doc || !Array.isArray(doc.면)) return { ok: false, 사유: '문서 모양이 아니다' };
    return { ok: true, mtime: saveDoc(slug, doc) };
  } catch (e) {
    return { ok: false, 사유: e.message };
  }
}

// 화면이 문서를 다시 불러올 때 기준시각도 같이 준다
export async function 문안불러오기(slug) {
  try {
    return { ok: true, doc: loadDoc(slug), mtime: docMtime(slug) };
  } catch (e) {
    return { ok: false, 사유: e.message };
  }
}
