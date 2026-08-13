import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth.config";

/**
 * /admin 配下の保護。
 *
 * これが無かったため、/admin/crm が**未認証で誰でも見られる状態**だった。
 * あの画面は client-hub の顧客台帳を表示し、台帳には就労支援事業所の
 * 利用者（氏名・A型/B型）が入っている。
 */
export default NextAuth(authConfig).auth;

export const config = {
  matcher: ["/admin/:path*"],
};
