import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

type CookieToSet = { name: string; value: string; options?: CookieOptions };
import type { Database } from "@/types/database";

// `/opengraph-image` là ảnh xem trước link do Next sinh ra. Bot của Zalo /
// Messenger / Teams không có phiên đăng nhập, chặn nó lại là thẻ preview trống.
const PUBLIC_ROUTES = ["/login", "/opengraph-image"];

/**
 * Refresh Supabase session và bảo vệ route.
 * Chưa đăng nhập → đẩy về /login. Đã đăng nhập mà vào /login → đẩy về /.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Dùng getClaims() thay getUser(): khoá JWT của project là ES256 (bất đối
  // xứng) nên chữ ký được xác minh ngay tại chỗ bằng JWKS đã cache — 1ms thay
  // vì ~300ms gọi sang Supabase, mà middleware thì chạy ở MỌI request.
  // Bắt buộc gọi không truyền token: khi đó nó đi qua getSession(), vốn tự gia
  // hạn token sắp hết hạn và ghi lại cookie. Đây là việc middleware phải làm,
  // bỏ đi là user bị đăng xuất sau mỗi giờ.
  const { data: claims } = await supabase.auth.getClaims();
  const user = claims?.claims ?? null;

  const { pathname } = request.nextUrl;
  const isPublic = PUBLIC_ROUTES.some((p) => pathname.startsWith(p));

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (user && pathname === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  return response;
}
