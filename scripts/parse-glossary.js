const fs = require('fs');
const path = require('path');

const mdPath = path.join(
  process.env.HOME || process.env.USERPROFILE,
  'OneDrive/Desktop/[1차 핵심 용어 확장본] - 복사본.md'
);
const outPath = path.join(__dirname, '../data/terms.json');

const text = fs.readFileSync(mdPath, 'utf-8');
const lines = text.split(/\r?\n/);

const chapters = [];
let currentChapter = null;
let currentTerm = null;
let currentSection = null;
let globalId = 0;

const sectionMap = {
  '[사전용어]': 'definition',
  '[쉬운 설명]': 'easy',
  '[실생활 예시]': 'example',
  '[현업에서는 언제 쓰나]': 'industry',
  '[우리 프로젝트 연결]': 'project',
};

function flushTerm() {
  if (currentTerm && currentChapter) {
    globalId += 1;
    currentTerm.uid = `t${globalId}`;
    currentChapter.terms.push(currentTerm);
  }
  currentTerm = null;
  currentSection = null;
}

for (let i = 0; i < lines.length; i += 1) {
  const line = lines[i];

  const chapterMatch = line.match(/^\[(\d+차[^\]]*)\]/);
  if (chapterMatch) {
    currentChapter = { label: chapterMatch[1].trim(), topic: '', terms: [] };
    chapters.push(currentChapter);
    continue;
  }

  if (line.startsWith('주제:')) {
    if (currentChapter) currentChapter.topic = line.replace('주제:', '').trim();
    continue;
  }

  if (/^={10,}$/.test(line)) {
    const next = lines[i + 1];
    if (next && /^\d+\.\s/.test(next)) {
      flushTerm();
      const match = next.trim().match(/^(\d+)\.\s+(.+)$/);
      if (match) {
        currentTerm = {
          num: parseInt(match[1], 10),
          title: match[2],
          definition: '',
          easy: '',
          example: '',
          industry: '',
          project: '',
        };
      }
      i += 1;
      continue;
    }
  }

  if (sectionMap[line]) {
    currentSection = sectionMap[line];
    continue;
  }

  if (currentTerm && currentSection) {
    if (/^\d+차 용어집/.test(line) || line.startsWith('형식:')) continue;
    if (line.startsWith('- ')) {
      currentTerm[currentSection] += (currentTerm[currentSection] ? '\n' : '') + line.slice(2);
    } else if (line.trim()) {
      currentTerm[currentSection] += (currentTerm[currentSection] ? '\n' : '') + line;
    }
  }
}
flushTerm();

const labelCount = {};
chapters.forEach((ch) => {
  labelCount[ch.label] = (labelCount[ch.label] || 0) + 1;
});
const labelSeen = {};
chapters.forEach((ch) => {
  if (labelCount[ch.label] > 1) {
    labelSeen[ch.label] = (labelSeen[ch.label] || 0) + 1;
    ch.label = `${ch.label} (${labelSeen[ch.label]}부)`;
  }
});

const data = {
  title: '딥러닝·개발 핵심 용어집',
  chapters,
  totalTerms: globalId,
};

fs.writeFileSync(outPath, JSON.stringify(data));

const jsPath = path.join(__dirname, '../data/terms.js');
fs.writeFileSync(jsPath, `window.GLOSSARY_DATA = ${JSON.stringify(data)};`);

console.log(`Generated ${outPath} — ${chapters.length} chapters, ${globalId} terms`);
