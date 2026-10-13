# DATA MODEL — Nordic Work Intelligence

PostgreSQL + Prisma. Barcha jadvallarda `id` (UUID), `createdAt`, kerakli joyda `updatedAt`. Vaqtlar `timestamptz` (UTC). Bu hujjat modelning mantiqiy tavsifi; aniq `schema.prisma` 2-bosqichda shu asosda yoziladi.

## 1. Aloqalar xaritasi

```
Department 1─∞ EmployeeProfile 1─1 User ∞─∞ Role ∞─∞ Permission
Department 1─1 User (rahbar)
EmployeeProfile 1─∞ Workstation 1─∞ AgentInstallation 1─∞ ActivitySession 1─∞ ActivityEvent
Application 1─∞ ActivityEvent
MonitoringPolicy 1─∞ Department / EmployeeProfile (biriktirish)
AgentInstallation 1─∞ Screenshot
AccreditationCriterion 1─∞ Task 1─∞ TaskAssignment ∞─1 EmployeeProfile
Task 1─∞ TaskStatusHistory, TaskComment
Task 1─∞ Document 1─∞ DocumentVersion
AIProvider 1─∞ AIUsageSession 1─∞ AIUsageEvent
AIUsageSession ∞─1 Task (ixtiyoriy), ∞─1 EmployeeProfile
User 1─∞ Session, Notification, AuditLog, Report
```

## 2. Foydalanuvchi va ruxsatlar

| Entity              | Asosiy maydonlar                                                                                                | Cheklovlar va indekslar                                         |
| ------------------- | --------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| **User**            | email, passwordHash, fullName, isActive, mfaSecretEnc, mfaEnabledAt, failedLoginCount, lockedUntil, lastLoginAt | `email` unique (kichik harfda)                                  |
| **Role**            | code, name, isSystem                                                                                            | `code` unique                                                   |
| **Permission**      | code, description                                                                                               | `code` unique                                                   |
| **UserRole**        | userId, roleId                                                                                                  | PK `(userId, roleId)`                                           |
| **RolePermission**  | roleId, permissionId                                                                                            | PK `(roleId, permissionId)`                                     |
| **UserPermission**  | userId, permissionId, grantedById                                                                               | Alohida beriladigan ruxsatlar (masalan `screenshots.view`)      |
| **Session**         | userId, tokenHash, ip, userAgent, expiresAt, lastSeenAt, revokedAt, mfaVerifiedAt                               | `tokenHash` unique; indeks `(userId, revokedAt)`                |
| **Department**      | name, code, parentId, headUserId                                                                                | `code` unique; o‘z-o‘ziga FK (ierarxiya)                        |
| **EmployeeProfile** | userId, departmentId, position, employeeNumber, hiredAt, monitoringConsentAt, isActive                          | `userId` unique; `employeeNumber` unique; indeks `departmentId` |

## 3. Qurilma va agent

| Entity                  | Asosiy maydonlar                                                                                                                                                             | Cheklovlar va indekslar                          |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| **Workstation**         | employeeId, hostname, osVersion, machineIdHash                                                                                                                               | `machineIdHash` unique                           |
| **AgentEnrollmentCode** | codeHash, employeeId, createdById, expiresAt, usedAt                                                                                                                         | `codeHash` unique                                |
| **AgentInstallation**   | workstationId, tokenHash, agentVersion, status (ACTIVE / REVOKED), lastSeenAt, lastConfigVersion, revokedAt                                                                  | `tokenHash` unique; indeks `lastSeenAt`          |
| **AgentErrorReport**    | agentInstallationId, code, message, occurredAt                                                                                                                               | Indeks `(agentInstallationId, occurredAt)`       |
| **MonitoringPolicy**    | name, workSchedule (JSON: kunlar, soatlar), timezone, idleThresholdSec, screenshotsEnabled, screenshotIntervalSec, excludedProcesses[], allowedDomains[], version, isDefault | Har bir o‘zgarish `version` ni oshiradi          |
| **PolicyAssignment**    | policyId, departmentId?, employeeId?                                                                                                                                         | Aniqlik tartibi: xodim → bo‘lim → sukut bo‘yicha |

## 4. Faoliyat

| Entity                   | Asosiy maydonlar                                                                                                                                                                                                                                                       | Cheklovlar va indekslar                                                                                                                                                                                                                                      |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Application**          | processName, displayName, category, workRelevance (WORK / NEUTRAL / NON_WORK / UNCLASSIFIED), isAiTool, aiProviderId                                                                                                                                                   | `processName` unique (kichik harfda)                                                                                                                                                                                                                         |
| **ActivitySession**      | agentInstallationId, employeeId, startedAt, endedAt, endReason                                                                                                                                                                                                         | Agentning bir marta ishga tushishidan to‘xtashigacha. Indeks `(employeeId, startedAt)`                                                                                                                                                                       |
| **ActivityEvent**        | agentInstallationId, clientEventId, sessionId, employeeId, applicationId, domainCategory?, startedAt, endedAt, activeSec, idleSec, state (ACTIVE / IDLE / LOCKED), source (AGENT / EXTENSION / MANUAL), confidence (HIGH / MEDIUM / LOW), monitoringStatus, receivedAt | **Unique `(agentInstallationId, clientEventId)`** — dublikatdan himoya. Indekslar `(employeeId, startedAt)`, `(applicationId, startedAt)`. `startedAt` bo‘yicha oylik partitsiya. CHECK: `endedAt > startedAt`, `activeSec + idleSec` davomiylikdan oshmaydi |
| **DailyActivitySummary** | employeeId, date (tashkilot vaqt zonasida), applicationId, activeSec, idleSec, eventCount                                                                                                                                                                              | Unique `(employeeId, date, applicationId)`                                                                                                                                                                                                                   |
| **DailyWorkSummary**     | employeeId, date, scheduledSec, observedSec, activeSec, idleSec, coveragePct, firstSeenAt, lastSeenAt                                                                                                                                                                  | Unique `(employeeId, date)`                                                                                                                                                                                                                                  |
| **Screenshot**           | agentInstallationId, employeeId, capturedAt, storageKey, encKeyWrapped, iv, sha256, sizeBytes, expiresAt, deletedAt                                                                                                                                                    | Indekslar `(employeeId, capturedAt)`, `expiresAt`                                                                                                                                                                                                            |
| **ScreenshotView**       | screenshotId, viewerId, viewedAt, ip                                                                                                                                                                                                                                   | Har bir ko‘rish alohida yozuv (auditga qo‘shimcha)                                                                                                                                                                                                           |

## 5. Topshiriq va akkreditatsiya

| Entity                     | Asosiy maydonlar                                                                                                                                                                          | Cheklovlar va indekslar                                                                                                          |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| **AccreditationCriterion** | code (masalan «3.2.1»), title, description, parentId, direction                                                                                                                           | `code` unique; ierarxiya                                                                                                         |
| **Task**                   | title, description, direction, criterionId, ownerId (mas’ul), createdById, dueAt, priority, expectedResult, progressPct, status, delayReason, acceptedById, acceptedAt, completedAt       | Indekslar `(status, dueAt)`, `ownerId`, `criterionId`. CHECK `progressPct` 0–100                                                 |
| **TaskAssignment**         | taskId, employeeId, role (OWNER / COLLABORATOR)                                                                                                                                           | Unique `(taskId, employeeId)`                                                                                                    |
| **TaskStatusHistory**      | taskId, fromStatus, toStatus, changedById, comment, changedAt                                                                                                                             | Indeks `(taskId, changedAt)`. Tasdiqlash tarixi shu jadvalda                                                                     |
| **TaskComment**            | taskId, authorId, body                                                                                                                                                                    | Indeks `(taskId, createdAt)`                                                                                                     |
| **Document**               | taskId, title, kind, createdById, status (DRAFT / SUBMITTED / IN_REVIEW / NEEDS_FIX / APPROVED), reviewerId, reviewedAt, qualityScore?, currentVersionId, aiAssisted (YES / NO / UNKNOWN) | Indeks `(taskId, status)`                                                                                                        |
| **DocumentVersion**        | documentId, versionNo, sha256, storageKey, fileName, mimeType, sizeBytes, uploadedById, note                                                                                              | Unique `(documentId, versionNo)` va **unique `(documentId, sha256)`** — bir xil mazmun qayta yuklansa yangi versiya yaratilmaydi |

`Task.status` qiymatlari: NEW, PLANNED, IN_PROGRESS, IN_REVIEW, NEEDS_FIX, APPROVED, DONE, DELAYED, CANCELLED.

Ruxsat etilgan o‘tishlar:

```
NEW → PLANNED → IN_PROGRESS → IN_REVIEW → APPROVED → DONE
                    ▲             │
                    └─ NEEDS_FIX ◄┘
IN_PROGRESS ↔ DELAYED        har qanday (DONE dan tashqari) → CANCELLED
```

`APPROVED` va `DONE` ga o‘tish faqat `tasks.approve` ruxsati bilan; `DONE` uchun kamida bitta `APPROVED` hujjat yoki kutilayotgan natija qabul qilingani haqida yozuv talab etiladi.

## 6. AI vositalari

| Entity                 | Asosiy maydonlar                                                                                                                               | Cheklovlar va indekslar                                                                                                                    |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| **AIProvider**         | code (masalan `claude`), name, isApproved, processNames[], domains[]                                                                           | `code` unique                                                                                                                              |
| **AIUsageSession**     | employeeId, providerId, taskId?, startedAt, endedAt, activeSec, source (AGENT_ACTIVITY / OFFICIAL_API / SELF_REPORT), confidence, externalRef? | Indekslar `(employeeId, startedAt)`, `taskId`. Unique `(providerId, source, externalRef)` — tashqi manbadan qayta import dublikat bermaydi |
| **AIUsageEvent**       | sessionId, type, occurredAt, metadata (JSON, faqat ruxsat etilgan metama’lumot)                                                                | Indeks `(sessionId, occurredAt)`                                                                                                           |
| **AIResultSubmission** | sessionId?, taskId, documentId?, submittedById, summary, status (SUBMITTED / CONFIRMED / REJECTED), confirmedById, confirmedAt                 | Xodim topshirgan natija va uning tasdig‘i                                                                                                  |

Mazmun (prompt, javob) saqlanmaydi. Manba ishonchli son bermasa, maydon `NULL` qoladi va interfeysda «Aniqlanmadi» ko‘rsatiladi — nol emas.

## 7. Tizim

| Entity              | Asosiy maydonlar                                                                                               | Cheklovlar va indekslar                                                                       |
| ------------------- | -------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| **Report**          | type, params (JSON), periodFrom, periodTo, generatedById, generatedAt, dataCompletenessPct, format, storageKey | Indeks `(generatedById, generatedAt)`                                                         |
| **Notification**    | userId, type, title, body, link, readAt                                                                        | Indeks `(userId, readAt)`                                                                     |
| **AuditLog**        | actorUserId?, actorAgentId?, action, entityType, entityId, ip, userAgent, outcome, diff (JSON), occurredAt     | Indekslar `(occurredAt)`, `(actorUserId, occurredAt)`, `(entityType, entityId)`. Faqat INSERT |
| **RetentionPolicy** | dataType, retainDays                                                                                           | `dataType` unique                                                                             |
| **SystemSetting**   | key, value (JSON), updatedById                                                                                 | `key` unique                                                                                  |
| **ScoreFormula**    | name, weights (JSON), minDataRequirements (JSON), isActive, updatedById                                        | Samaradorlik formulasi; o‘zgarish tarixi auditda                                              |

## 8. Yaxlitlik qoidalari

- Barcha bog‘lanishlar FK bilan. Xodim o‘chirilmaydi, `isActive = false` qilinadi (tarix saqlanadi).
- `onDelete`: tarixiy yozuvlarda `Restrict`; bog‘lovchi jadvallarda `Cascade`.
- Ko‘p jadvalga yoziladigan amallar (topshiriq holati + tarix + bildirishnoma + audit) bitta tranzaksiyada.
- Ro‘yxatlar: kursor asosidagi pagination (`id` + saralash maydoni), sukut bo‘yicha 25, eng ko‘pi 100.

## 9. Hajm, arxivlash, tozalash

Taxmin: 300 xodim × kuniga ~1 500 segment ≈ 450 000 qator/kun, ~10 mln/oy.

- `ActivityEvent` oylik partitsiyalar; kelgusi oy partitsiyasi fon vazifasi bilan oldindan yaratiladi.
- Hisobotlar `Daily*Summary` jadvallaridan o‘qiydi.
- Tozalash vazifasi har kecha: muddati o‘tgan partitsiyalarni tashlaydi, muddati o‘tgan ekran tasvirlari faylini o‘chirib `deletedAt` qo‘yadi, muddati o‘tgan sessiya va kodlarni o‘chiradi.
- Tozalashning har bir ishga tushishi audit jurnaliga yoziladi.
