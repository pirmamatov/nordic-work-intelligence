import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import QRCode from 'qrcode';
import { useEffect, useState, type ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { loginSchema, type LoginInput } from '@nwi/shared';
import { useAuth } from '@/auth/AuthContext';
import { BrandMark, BrandTitle } from '@/components/Brand';
import { Notice } from '@/components/States';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/form';
import { api, errorMessage } from '@/lib/api';
import type { AuthResponse } from '@/lib/types';

function AuthShell(props: {
  title: string;
  description?: string;
  children: ReactNode;
  showLogout?: boolean;
}) {
  const { logout } = useAuth();
  return (
    <div className="flex min-h-full items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center gap-3">
          <BrandMark />
          <BrandTitle />
        </div>
        <div className="rounded-lg border border-line bg-white p-6 shadow-sm">
          <h1 className="text-lg font-semibold">{props.title}</h1>
          {props.description ? (
            <p className="mt-1 text-sm text-muted">{props.description}</p>
          ) : null}
          <div className="mt-5">{props.children}</div>
        </div>
        {props.showLogout ? (
          <button className="mt-4 text-sm text-muted underline" onClick={() => void logout()}>
            Boshqa hisob bilan kirish
          </button>
        ) : null}
      </div>
    </div>
  );
}

export function LoginScreen() {
  const { accept } = useAuth();
  const form = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });
  const login = useMutation({
    mutationFn: (input: LoginInput) => api.post<AuthResponse>('/auth/login', input),
    onSuccess: accept,
  });

  return (
    <AuthShell
      title="Tizimga kirish"
      description="Ish elektron pochtangiz va parolingizni kiriting."
    >
      <form
        className="space-y-4"
        onSubmit={form.handleSubmit((values) => login.mutate(values))}
        noValidate
      >
        {login.isError ? <Notice tone="error">{errorMessage(login.error)}</Notice> : null}
        <Field label="Elektron pochta" htmlFor="email" error={form.formState.errors.email?.message}>
          <Input
            id="email"
            type="email"
            autoComplete="username"
            autoFocus
            {...form.register('email')}
          />
        </Field>
        <Field label="Parol" htmlFor="password" error={form.formState.errors.password?.message}>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            {...form.register('password')}
          />
        </Field>
        <Button type="submit" className="w-full" loading={login.isPending}>
          Kirish
        </Button>
      </form>
    </AuthShell>
  );
}

const codeSchema = z.object({ code: z.string().trim().min(6, 'Kodni kiriting').max(32) });
type CodeInput = z.infer<typeof codeSchema>;

export function MfaVerifyScreen() {
  const { refresh } = useAuth();
  const form = useForm<CodeInput>({
    resolver: zodResolver(codeSchema),
    defaultValues: { code: '' },
  });
  const verify = useMutation({
    mutationFn: (input: CodeInput) => api.post('/auth/mfa/verify', input),
    onSuccess: refresh,
  });

  return (
    <AuthShell
      title="Ikki bosqichli tasdiqlash"
      description="Autentifikator ilovasidagi 6 raqamli kodni yoki zaxira kodini kiriting."
      showLogout
    >
      <form
        className="space-y-4"
        onSubmit={form.handleSubmit((values) => verify.mutate(values))}
        noValidate
      >
        {verify.isError ? <Notice tone="error">{errorMessage(verify.error)}</Notice> : null}
        <Field label="Tasdiqlash kodi" htmlFor="code" error={form.formState.errors.code?.message}>
          <Input
            id="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            autoFocus
            {...form.register('code')}
          />
        </Field>
        <Button type="submit" className="w-full" loading={verify.isPending}>
          Tasdiqlash
        </Button>
      </form>
    </AuthShell>
  );
}

const passwordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Joriy parolni kiriting'),
    newPassword: z.string().min(12, 'Parol kamida 12 ta belgidan iborat bo‘lishi kerak').max(128),
    repeat: z.string(),
  })
  .refine((v) => v.newPassword === v.repeat, { message: 'Parollar mos kelmadi', path: ['repeat'] });
type PasswordInput = z.infer<typeof passwordSchema>;

export function ChangePasswordForm(props: {
  onDone: () => void | Promise<void>;
  submitLabel?: string;
}) {
  const form = useForm<PasswordInput>({
    resolver: zodResolver(passwordSchema),
    defaultValues: { currentPassword: '', newPassword: '', repeat: '' },
  });
  const change = useMutation({
    mutationFn: ({ currentPassword, newPassword }: PasswordInput) =>
      api.post('/auth/change-password', { currentPassword, newPassword }),
    onSuccess: async () => {
      form.reset();
      await props.onDone();
    },
  });
  const errors = form.formState.errors;

  return (
    <form
      className="space-y-4"
      onSubmit={form.handleSubmit((values) => change.mutate(values))}
      noValidate
    >
      {change.isError ? <Notice tone="error">{errorMessage(change.error)}</Notice> : null}
      {change.isSuccess ? (
        <Notice tone="success">
          Parol almashtirildi. Boshqa qurilmalardagi sessiyalar yopildi.
        </Notice>
      ) : null}
      <Field label="Joriy parol" htmlFor="currentPassword" error={errors.currentPassword?.message}>
        <Input
          id="currentPassword"
          type="password"
          autoComplete="current-password"
          {...form.register('currentPassword')}
        />
      </Field>
      <Field
        label="Yangi parol"
        htmlFor="newPassword"
        error={errors.newPassword?.message}
        hint="Kamida 12 ta belgi."
      >
        <Input
          id="newPassword"
          type="password"
          autoComplete="new-password"
          {...form.register('newPassword')}
        />
      </Field>
      <Field label="Yangi parolni takrorlang" htmlFor="repeat" error={errors.repeat?.message}>
        <Input
          id="repeat"
          type="password"
          autoComplete="new-password"
          {...form.register('repeat')}
        />
      </Field>
      <Button type="submit" loading={change.isPending}>
        {props.submitLabel ?? 'Parolni almashtirish'}
      </Button>
    </form>
  );
}

export function ForcedPasswordScreen() {
  const { refresh } = useAuth();
  return (
    <AuthShell
      title="Parolni almashtiring"
      description="Sizga vaqtinchalik parol berilgan. Davom etish uchun o‘z parolingizni o‘rnating."
      showLogout
    >
      <ChangePasswordForm onDone={refresh} submitLabel="Saqlash va davom etish" />
    </AuthShell>
  );
}

/** MFA ni yoqish: QR kod → tasdiqlash kodi → zaxira kodlari. */
export function MfaSetupFlow(props: { onDone: () => void | Promise<void> }) {
  const [qr, setQr] = useState<string | null>(null);
  const start = useMutation({
    mutationFn: () => api.post<{ secret: string; otpauthUrl: string }>('/auth/mfa/setup'),
  });
  const form = useForm<CodeInput>({
    resolver: zodResolver(codeSchema),
    defaultValues: { code: '' },
  });
  const enable = useMutation({
    mutationFn: (input: CodeInput) =>
      api.post<{ recoveryCodes: string[] }>('/auth/mfa/enable', input),
  });

  const otpauthUrl = start.data?.otpauthUrl;
  useEffect(() => {
    if (!otpauthUrl) return;
    let cancelled = false;
    void QRCode.toDataURL(otpauthUrl, { margin: 1, width: 200 }).then((url) => {
      if (!cancelled) setQr(url);
    });
    return () => {
      cancelled = true;
    };
  }, [otpauthUrl]);

  if (enable.data) {
    return (
      <div className="space-y-4">
        <Notice tone="success">Ikki bosqichli tasdiqlash yoqildi.</Notice>
        <p className="text-sm">
          Quyidagi zaxira kodlarini xavfsiz joyga yozib oling. Telefoningiz yo‘qolsa, ular bilan
          kirasiz. Har bir kod bir marta ishlaydi va <strong>qayta ko‘rsatilmaydi</strong>.
        </p>
        <ul className="grid grid-cols-2 gap-2 rounded-md border border-line bg-surface p-3 font-mono text-sm">
          {enable.data.recoveryCodes.map((code) => (
            <li key={code}>{code}</li>
          ))}
        </ul>
        <Button onClick={() => void props.onDone()}>Kodlarni yozib oldim, davom etish</Button>
      </div>
    );
  }

  if (!start.data) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted">
          Telefoningizga autentifikator ilovasini (Google Authenticator, Microsoft Authenticator va
          shu kabi) o‘rnating, so‘ng boshlang.
        </p>
        {start.isError ? <Notice tone="error">{errorMessage(start.error)}</Notice> : null}
        <Button onClick={() => start.mutate()} loading={start.isPending}>
          Sozlashni boshlash
        </Button>
      </div>
    );
  }

  return (
    <form
      className="space-y-4"
      onSubmit={form.handleSubmit((values) => enable.mutate(values))}
      noValidate
    >
      <p className="text-sm">
        1. Autentifikator ilovasida QR kodni skanerlang yoki kalitni qo‘lda kiriting.
      </p>
      <div className="flex flex-wrap items-center gap-4">
        {qr ? (
          <img
            src={qr}
            alt="MFA sozlash uchun QR kod"
            width={160}
            height={160}
            className="rounded border border-line"
          />
        ) : null}
        <code className="rounded bg-surface px-2 py-1 text-xs break-all">{start.data.secret}</code>
      </div>
      <p className="text-sm">2. Ilova ko‘rsatgan 6 raqamli kodni kiriting.</p>
      {enable.isError ? <Notice tone="error">{errorMessage(enable.error)}</Notice> : null}
      <Field label="Tasdiqlash kodi" htmlFor="mfa-code" error={form.formState.errors.code?.message}>
        <Input
          id="mfa-code"
          inputMode="numeric"
          autoComplete="one-time-code"
          {...form.register('code')}
        />
      </Field>
      <Button type="submit" loading={enable.isPending}>
        Yoqish
      </Button>
    </form>
  );
}

export function ForcedMfaSetupScreen() {
  const { refresh } = useAuth();
  return (
    <AuthShell
      title="Ikki bosqichli tasdiqlashni yoqing"
      description="Sizning rolingiz cheklangan ma’lumotlarga kirish beradi, shuning uchun bu majburiy."
      showLogout
    >
      <MfaSetupFlow onDone={refresh} />
    </AuthShell>
  );
}
