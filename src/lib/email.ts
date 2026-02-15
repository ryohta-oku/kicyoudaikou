import nodemailer from "nodemailer";

function getTransporter() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    return null;
  }

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });
}

export async function sendInviteEmail(to: string, name: string, token: string) {
  const appUrl = process.env.APP_URL || "http://localhost:3000";
  const setupUrl = `${appUrl}/setup-password?token=${token}`;
  const from = process.env.SMTP_FROM || process.env.SMTP_USER || "noreply@example.com";

  const transporter = getTransporter();

  if (!transporter) {
    // SMTP未設定の場合はコンソールに出力（開発用）
    console.log("=== 招待メール（SMTP未設定のためコンソール出力） ===");
    console.log(`宛先: ${to}`);
    console.log(`名前: ${name}`);
    console.log(`パスワード設定URL: ${setupUrl}`);
    console.log("================================================");
    return { success: true, consoleOnly: true, setupUrl };
  }

  await transporter.sendMail({
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
