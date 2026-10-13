import { randomUUID } from 'node:crypto';
import path from 'node:path';
import type { Request } from 'express';
import { CLOSED_TASK_STATUSES, type ReviewDocumentInput } from '@nwi/shared';
import { decryptBlob, encryptBlob, sha256Hex } from '../../lib/crypto';
import { AppError, badRequest, conflict, forbidden, notFound } from '../../lib/errors';
import { prisma } from '../../lib/prisma';
import { getObject, putObject, removeObject } from '../../lib/storage';
import type { AiAssisted } from '../../generated/prisma/enums';
import { recordAudit } from '../audit/service';
import type { AuthContext } from '../auth/context';
import { notifyUsers } from '../notifications/service';
import { loadTask } from '../tasks/service';

// Ruxsat etilgan fayl turlari. Brauzerda bajarilishi mumkin bo'lgan turlar (html, svg, js) yo'q.
const MIME_BY_EXTENSION: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.ppt': 'application/vnd.ms-powerpoint',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.odt': 'application/vnd.oasis.opendocument.text',
  '.ods': 'application/vnd.oasis.opendocument.spreadsheet',
  '.odp': 'application/vnd.oasis.opendocument.presentation',
  '.txt': 'text/plain',
  '.csv': 'text/csv',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.zip': 'application/zip',
};

/** Fayl nomidan yo'l va boshqaruv belgilarini olib tashlaydi; kengaytma ruxsat etilganini tekshiradi. */
export function safeFileName(raw: string): { fileName: string; mimeType: string } {
  // eslint-disable-next-line no-control-regex -- boshqaruv belgilari ataylab olib tashlanadi
  const base = (raw.split(/[\\/]/).pop() ?? '').replace(/[\u0000-\u001f"<>|:*?]/g, '').trim();
  const fileName = base.slice(-200);
  const mimeType = MIME_BY_EXTENSION[path.extname(fileName).toLowerCase()];
  if (!fileName || fileName.startsWith('.') || !mimeType) {
    throw badRequest(
      `Fayl turi qabul qilinmaydi. Ruxsat etilgan: ${Object.keys(MIME_BY_EXTENSION).join(', ')}`,
      'UNSUPPORTED_FILE_TYPE',
    );
  }
  return { fileName, mimeType };
}

async function storeFile(documentId: string, data: Buffer) {
  const { sealed, wrappedKey } = encryptBlob(data);
  const storageKey = `documents/${documentId}/${randomUUID()}.bin`;
  await putObject(storageKey, sealed);
  return { storageKey, encKeyWrapped: wrappedKey, sha256: sha256Hex(data), sizeBytes: data.length };
}

export interface UploadMeta {
  title?: string | undefined;
  fileName: string;
  note?: string | undefined;
  aiAssisted?: AiAssisted | undefined;
}

/** Topshiriqqa yangi hujjat (1-versiyasi bilan) qo'shadi. */
export async function createDocument(
  req: Request,
  auth: AuthContext,
  taskId: string,
  meta: UploadMeta,
  data: Buffer,
) {
  if (data.length === 0) throw badRequest('Fayl bo‘sh', 'EMPTY_FILE');
  const { fileName, mimeType } = safeFileName(meta.fileName);
  const { task, caps } = await loadTask(auth, taskId);
  if (!caps.isParticipant && !caps.canManage) throw forbidden();
  if (CLOSED_TASK_STATUSES.includes(task.status))
    throw conflict('Yakunlangan topshiriqqa hujjat qo‘shilmaydi', 'TASK_CLOSED');

  const documentId = randomUUID();
  const file = await storeFile(documentId, data);
  try {
    await prisma.$transaction(async (tx) => {
      await tx.document.create({
        data: {
          id: documentId,
          taskId,
          title: meta.title?.trim() || fileName,
          createdById: auth.userId,
          aiAssisted: meta.aiAssisted ?? 'UNKNOWN',
          versions: {
            create: {
              versionNo: 1,
              ...file,
              fileName,
              mimeType,
              uploadedById: auth.userId,
              note: meta.note ?? null,
            },
          },
        },
      });
      await recordAudit(
        req,
        {
          action: 'document.create',
          entityType: 'Document',
          entityId: documentId,
          diff: { taskId, fileName, sha256: file.sha256 },
        },
        tx,
      );
    });
  } catch (error) {
    await removeObject(file.storageKey);
    throw error;
  }
  return { id: documentId, versionNo: 1, duplicate: false };
}

async function loadDocument(auth: AuthContext, id: string) {
  const document = await prisma.document.findUnique({
    where: { id },
    include: { versions: { orderBy: { versionNo: 'desc' } } },
  });
  if (!document) throw notFound('Hujjat');
  // Hujjat topshiriq orqali ko'rinadi: topshiriq doiradan tashqarida bo'lsa, hujjat ham "topilmadi".
  const access = await loadTask(auth, document.taskId).catch((error: unknown) => {
    if (error instanceof AppError && error.status === 404) throw notFound('Hujjat');
    throw error;
  });
  return { document, ...access };
}

/**
 * Mavjud hujjatga yangi versiya qo'shadi. Mazmuni avvalgi biror versiya bilan bir xil fayl
 * (qayta saqlash, qayta yuklash) yangi versiya ham, yangi hujjat ham hisoblanmaydi.
 */
export async function addVersion(
  req: Request,
  auth: AuthContext,
  documentId: string,
  meta: UploadMeta,
  data: Buffer,
) {
  if (data.length === 0) throw badRequest('Fayl bo‘sh', 'EMPTY_FILE');
  const { fileName, mimeType } = safeFileName(meta.fileName);
  const { document, task, caps } = await loadDocument(auth, documentId);
  if (!caps.isParticipant && !caps.canManage) throw forbidden();
  if (CLOSED_TASK_STATUSES.includes(task.status))
    throw conflict('Yakunlangan topshiriq hujjati o‘zgartirilmaydi', 'TASK_CLOSED');

  const existing = document.versions.find((v) => v.sha256 === sha256Hex(data));
  if (existing) return { id: documentId, versionNo: existing.versionNo, duplicate: true };

  const file = await storeFile(documentId, data);
  const versionNo = (document.versions[0]?.versionNo ?? 0) + 1;
  try {
    await prisma.$transaction(async (tx) => {
      await tx.documentVersion.create({
        data: {
          documentId,
          versionNo,
          ...file,
          fileName,
          mimeType,
          uploadedById: auth.userId,
          note: meta.note ?? null,
        },
      });
      // Mazmun o'zgardi: avvalgi tekshiruv natijasi yangi versiyaga taalluqli emas.
      await tx.document.update({
        where: { id: documentId },
        data: {
          status: 'DRAFT',
          reviewerId: null,
          reviewedAt: null,
          reviewNote: null,
          qualityScore: null,
        },
      });
      await recordAudit(
        req,
        {
          action: 'document.version.add',
          entityType: 'Document',
          entityId: documentId,
          diff: { versionNo, fileName, sha256: file.sha256 },
        },
        tx,
      );
    });
  } catch (error) {
    await removeObject(file.storageKey);
    throw error;
  }
  return { id: documentId, versionNo, duplicate: false };
}

export async function submitDocument(req: Request, auth: AuthContext, id: string): Promise<void> {
  const { document, caps } = await loadDocument(auth, id);
  if (!caps.isParticipant && !caps.canManage) throw forbidden();
  if (document.status !== 'DRAFT' && document.status !== 'NEEDS_FIX') {
    throw conflict('Hujjat allaqachon tekshiruvga yuborilgan', 'DOCUMENT_ALREADY_SUBMITTED');
  }
  await prisma.$transaction(async (tx) => {
    await tx.document.update({ where: { id }, data: { status: 'SUBMITTED' } });
    await recordAudit(req, { action: 'document.submit', entityType: 'Document', entityId: id }, tx);
  });
}

export async function reviewDocument(
  req: Request,
  auth: AuthContext,
  id: string,
  input: ReviewDocumentInput,
): Promise<void> {
  const { document, caps } = await loadDocument(auth, id);
  if (!caps.canApprove) {
    throw forbidden(
      'FORBIDDEN',
      'Hujjatni faqat vakolatli shaxs tekshiradi; mas’ul xodim o‘z hujjatini tasdiqlay olmaydi',
    );
  }
  if (document.createdById === auth.userId)
    throw forbidden('FORBIDDEN', 'O‘zingiz yuklagan hujjatni tasdiqlay olmaysiz');
  if (document.status !== 'SUBMITTED' && document.status !== 'IN_REVIEW') {
    throw conflict('Hujjat tekshiruvga yuborilmagan', 'DOCUMENT_NOT_SUBMITTED');
  }
  if (input.decision === 'NEEDS_FIX' && !input.note)
    throw badRequest('Nimani tuzatish kerakligini yozing', 'NOTE_REQUIRED');

  await prisma.$transaction(async (tx) => {
    await tx.document.update({
      where: { id },
      data: {
        status: input.decision,
        reviewerId: auth.userId,
        reviewedAt: new Date(),
        reviewNote: input.note ?? null,
        qualityScore: input.qualityScore ?? null,
      },
    });
    await notifyUsers(
      tx,
      [document.createdById],
      {
        type: 'document.review',
        title:
          input.decision === 'APPROVED' ? 'Hujjat tasdiqlandi' : 'Hujjatni tuzatish talab qilinadi',
        body: document.title,
        link: `/topshiriqlar/${document.taskId}`,
      },
      auth.userId,
    );
    await recordAudit(
      req,
      {
        action: 'document.review',
        entityType: 'Document',
        entityId: id,
        diff: { decision: input.decision, qualityScore: input.qualityScore ?? null },
      },
      tx,
    );
  });
}

export async function downloadVersion(
  req: Request,
  auth: AuthContext,
  documentId: string,
  versionId: string,
) {
  const { document } = await loadDocument(auth, documentId);
  const version = document.versions.find((v) => v.id === versionId);
  if (!version) throw notFound('Hujjat versiyasi');
  const data = decryptBlob(await getObject(version.storageKey), version.encKeyWrapped);
  if (sha256Hex(data) !== version.sha256)
    throw new AppError(500, 'INTEGRITY_ERROR', 'Fayl yaxlitligi buzilgan');
  await recordAudit(req, {
    action: 'document.download',
    entityType: 'Document',
    entityId: documentId,
    diff: { versionNo: version.versionNo },
  });
  return { data, fileName: version.fileName, mimeType: version.mimeType };
}
