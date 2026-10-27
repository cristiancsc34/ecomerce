"use client";

import { useActionState } from "react";
import { signInAction, type LoginState } from "@/lib/admin/actions/auth";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";

const initial: LoginState = { error: null, email: "" };

export function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(signInAction, initial);
  return (
    <form action={action} className="mt-6 space-y-5" noValidate>
      <input type="hidden" name="next" value={next} />
      {state.error ? (
        <Notice tone="danger" role="alert" title="Não foi possível entrar">
          {state.error}
        </Notice>
      ) : null}
      <Field id="login-email" label="E-mail">
        <Input
          id="login-email"
          name="email"
          type="email"
          autoComplete="username"
          required
          defaultValue={state.email}
          aria-invalid={state.error ? true : undefined}
        />
      </Field>
      <Field id="login-password" label="Senha">
        <Input
          id="login-password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          aria-invalid={state.error ? true : undefined}
        />
      </Field>
      <Button type="submit" size="lg" className="w-full" loading={pending} loadingLabel="Entrando…">
        Entrar
      </Button>
    </form>
  );
}
