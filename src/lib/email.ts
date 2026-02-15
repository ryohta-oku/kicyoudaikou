import { Resend } from "resend";

function getResend() {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return null;
  return new Resend(apiKey);
}

export async function sendInviteEmail(to: string, name: string, token: string) {
  const appUrl = process.env.APP_URL || "http://localhost:3000";
  const setupUrl = `${appUrl}/setup-password?token=${token}`;
  const from = process.env.RESEND_FROM || "記帳代行ツール <onboarding@resend.dev>";

  const resend = getResend();

  if (!resend) {
    // API Key未設定の場合はコンソールに出力（開発用）
    console.log("=== 招待メール（RESEND_API_KEY未設定のためコンソール出力） ===");
    console.log(`宛先: ${to}`);
    console.log(`名前: ${name}`);
    console.log(`パスワード設定URL: ${setupUrl}`);
    console.log("============================================================");
    return { success: true, consoleOnly: true, setupUrl };
  }

  await resend.emails.send({
    from,
    to,
    subject: "【記帳代行ツール】パスワードを設定してください",
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #1e40af;">記帳代行ツール</h2>
        <p>${name} 様</p>
        <p>記帳代行ツールのアカウントが作成されました。<br>以下のリンクからパスワードを設定してください。</p>
        <p style="margin: 24px 0;">
          <a href="${setupUrl}" style="background-color: #2563eb; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; display: inline-block;">
            パスワードを設定する
          </a>
        </p>
        <p style="color: #6b7280; font-size: 14px;">このリンクは24時間有効です。</p>
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;">
        <p style="color: #9ca3af; font-size: 12px;">このメールに心当たりがない場合は無視してください。</p>
      </div>
    `,
  });

  return { success: true, consoleOnly: false };
}
