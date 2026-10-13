import type { AppCategory, WorkRelevance } from '../../generated/prisma/enums';

interface KnownApp {
  displayName: string;
  category: AppCategory;
  workRelevance: WorkRelevance;
}

// Dastur birinchi marta uchraganda qo'llanadigan boshlang'ich kategoriya.
// Administrator keyin panel orqali o'zgartirishi mumkin; ro'yxatda yo'q dastur
// "Tasniflanmagan" bo'lib tushadi.
export const KNOWN_APPS: Record<string, KnownApp> = {
  'winword.exe': { displayName: 'Microsoft Word', category: 'OFFICE', workRelevance: 'WORK' },
  'excel.exe': { displayName: 'Microsoft Excel', category: 'OFFICE', workRelevance: 'WORK' },
  'powerpnt.exe': {
    displayName: 'Microsoft PowerPoint',
    category: 'OFFICE',
    workRelevance: 'WORK',
  },
  'onenote.exe': { displayName: 'Microsoft OneNote', category: 'OFFICE', workRelevance: 'WORK' },
  'outlook.exe': {
    displayName: 'Microsoft Outlook',
    category: 'COMMUNICATION',
    workRelevance: 'WORK',
  },
  'olk.exe': { displayName: 'Microsoft Outlook', category: 'COMMUNICATION', workRelevance: 'WORK' },
  'ms-teams.exe': {
    displayName: 'Microsoft Teams',
    category: 'COMMUNICATION',
    workRelevance: 'WORK',
  },
  'teams.exe': { displayName: 'Microsoft Teams', category: 'COMMUNICATION', workRelevance: 'WORK' },
  'zoom.exe': { displayName: 'Zoom', category: 'COMMUNICATION', workRelevance: 'WORK' },
  'telegram.exe': { displayName: 'Telegram', category: 'COMMUNICATION', workRelevance: 'NEUTRAL' },
  'chrome.exe': { displayName: 'Google Chrome', category: 'BROWSER', workRelevance: 'NEUTRAL' },
  'msedge.exe': { displayName: 'Microsoft Edge', category: 'BROWSER', workRelevance: 'NEUTRAL' },
  'firefox.exe': { displayName: 'Mozilla Firefox', category: 'BROWSER', workRelevance: 'NEUTRAL' },
  'opera.exe': { displayName: 'Opera', category: 'BROWSER', workRelevance: 'NEUTRAL' },
  'brave.exe': { displayName: 'Brave', category: 'BROWSER', workRelevance: 'NEUTRAL' },
  'acrobat.exe': { displayName: 'Adobe Acrobat', category: 'PDF', workRelevance: 'WORK' },
  'acrord32.exe': { displayName: 'Adobe Acrobat Reader', category: 'PDF', workRelevance: 'WORK' },
  'foxitpdfreader.exe': { displayName: 'Foxit PDF Reader', category: 'PDF', workRelevance: 'WORK' },
  'foxitpdfeditor.exe': { displayName: 'Foxit PDF Editor', category: 'PDF', workRelevance: 'WORK' },
  'claude.exe': { displayName: 'Claude', category: 'AI', workRelevance: 'WORK' },
  'chatgpt.exe': { displayName: 'ChatGPT', category: 'AI', workRelevance: 'WORK' },
  'code.exe': { displayName: 'Visual Studio Code', category: 'DEVELOPMENT', workRelevance: 'WORK' },
  'explorer.exe': { displayName: 'Windows Explorer', category: 'SYSTEM', workRelevance: 'NEUTRAL' },
};

export function initialAppData(processName: string, reportedName?: string) {
  const known = KNOWN_APPS[processName];
  return {
    processName,
    displayName: known?.displayName ?? reportedName ?? processName,
    category: known?.category ?? ('OTHER' satisfies AppCategory),
    workRelevance: known?.workRelevance ?? ('UNCLASSIFIED' satisfies WorkRelevance),
  };
}
