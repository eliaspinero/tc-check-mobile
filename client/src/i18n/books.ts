import type { Tool } from '../engine/CheckingEngine';
import { locale, t } from './index';

// The 66 books of the eng canon: chapter count (eng versification) and the name in each language.
// A fixed table, as tC4's src/data/bookNames.ts: projects carry no localized book names to read.
const BOOKS: Record<string, [chapters: number, en: string, es: string]> = {
  GEN: [50, 'Genesis', 'Génesis'],
  EXO: [40, 'Exodus', 'Éxodo'],
  LEV: [27, 'Leviticus', 'Levítico'],
  NUM: [36, 'Numbers', 'Números'],
  DEU: [34, 'Deuteronomy', 'Deuteronomio'],
  JOS: [24, 'Joshua', 'Josué'],
  JDG: [21, 'Judges', 'Jueces'],
  RUT: [4, 'Ruth', 'Rut'],
  '1SA': [31, '1 Samuel', '1 Samuel'],
  '2SA': [24, '2 Samuel', '2 Samuel'],
  '1KI': [22, '1 Kings', '1 Reyes'],
  '2KI': [25, '2 Kings', '2 Reyes'],
  '1CH': [29, '1 Chronicles', '1 Crónicas'],
  '2CH': [36, '2 Chronicles', '2 Crónicas'],
  EZR: [10, 'Ezra', 'Esdras'],
  NEH: [13, 'Nehemiah', 'Nehemías'],
  EST: [10, 'Esther', 'Ester'],
  JOB: [42, 'Job', 'Job'],
  PSA: [150, 'Psalms', 'Salmos'],
  PRO: [31, 'Proverbs', 'Proverbios'],
  ECC: [12, 'Ecclesiastes', 'Eclesiastés'],
  SNG: [8, 'Song of Songs', 'Cantares'],
  ISA: [66, 'Isaiah', 'Isaías'],
  JER: [52, 'Jeremiah', 'Jeremías'],
  LAM: [5, 'Lamentations', 'Lamentaciones'],
  EZK: [48, 'Ezekiel', 'Ezequiel'],
  DAN: [12, 'Daniel', 'Daniel'],
  HOS: [14, 'Hosea', 'Oseas'],
  JOL: [3, 'Joel', 'Joel'],
  AMO: [9, 'Amos', 'Amós'],
  OBA: [1, 'Obadiah', 'Abdías'],
  JON: [4, 'Jonah', 'Jonás'],
  MIC: [7, 'Micah', 'Miqueas'],
  NAM: [3, 'Nahum', 'Nahúm'],
  HAB: [3, 'Habakkuk', 'Habacuc'],
  ZEP: [3, 'Zephaniah', 'Sofonías'],
  HAG: [2, 'Haggai', 'Hageo'],
  ZEC: [14, 'Zechariah', 'Zacarías'],
  MAL: [4, 'Malachi', 'Malaquías'],
  MAT: [28, 'Matthew', 'Mateo'],
  MRK: [16, 'Mark', 'Marcos'],
  LUK: [24, 'Luke', 'Lucas'],
  JHN: [21, 'John', 'Juan'],
  ACT: [28, 'Acts', 'Hechos'],
  ROM: [16, 'Romans', 'Romanos'],
  '1CO': [16, '1 Corinthians', '1 Corintios'],
  '2CO': [13, '2 Corinthians', '2 Corintios'],
  GAL: [6, 'Galatians', 'Gálatas'],
  EPH: [6, 'Ephesians', 'Efesios'],
  PHP: [4, 'Philippians', 'Filipenses'],
  COL: [4, 'Colossians', 'Colosenses'],
  '1TH': [5, '1 Thessalonians', '1 Tesalonicenses'],
  '2TH': [3, '2 Thessalonians', '2 Tesalonicenses'],
  '1TI': [6, '1 Timothy', '1 Timoteo'],
  '2TI': [4, '2 Timothy', '2 Timoteo'],
  TIT: [3, 'Titus', 'Tito'],
  PHM: [1, 'Philemon', 'Filemón'],
  HEB: [13, 'Hebrews', 'Hebreos'],
  JAS: [5, 'James', 'Santiago'],
  '1PE': [5, '1 Peter', '1 Pedro'],
  '2PE': [3, '2 Peter', '2 Pedro'],
  '1JN': [5, '1 John', '1 Juan'],
  '2JN': [1, '2 John', '2 Juan'],
  '3JN': [1, '3 John', '3 Juan'],
  JUD: [1, 'Jude', 'Judas'],
  REV: [22, 'Revelation', 'Apocalipsis'],
};

/** The book's name in the phone's language; the code itself for a code outside the canon. */
export const bookName = (code: string): string => {
  const book = BOOKS[code.toUpperCase()];
  return book ? book[locale === 'es' ? 2 : 1] : code;
};

/** How many chapters the book has (eng versification); 0 for a code outside the canon. */
export const chapterCount = (code: string): number => BOOKS[code.toUpperCase()]?.[0] ?? 0;

export const toolName = (tool: Tool): string => t(tool === 'translationWords' ? 'words' : 'notes');
