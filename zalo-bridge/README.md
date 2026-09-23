# Cầu nối Zalo — chạy trên laptop Ubuntu

Zalo chặn API thông tin cá nhân khi yêu cầu đến từ IP ngoài Việt Nam:

```
Zalo token không hợp lệ: Personal information is limited due to IP address
not inside Vietnam: 15.164.50.91
```

Edge Function của Supabase chạy trên hạ tầng nước ngoài nên luôn dính lỗi này.
Cầu nối là một server nhỏ đặt tại Việt Nam, đứng ra gọi Zalo hộ:

```
Mini App → Edge Function (Supabase, nước ngoài)
         → cầu nối (laptop Ubuntu, IP Việt Nam)
         → graph.zalo.me / openapi.zalo.me / oauth.zaloapp.com
```

## Laptop có cần bật 24/7 không?

**Không.** Token Zalo chỉ cần xác minh khi:

- nhân viên **liên kết tài khoản lần đầu**, hoặc
- phiên Supabase trong máy đã mất (người dùng bấm đăng xuất, xoá dữ liệu app…).

Các lần mở app sau, app dùng refresh token lưu sẵn trong máy, không gọi sang
Zalo. Nên laptop tắt thì người đã liên kết vẫn dùng app bình thường.

Riêng **nhắc việc qua OA** cần laptop bật vào giờ chạy cron (mặc định 7:30
sáng T2–T7). Laptop tắt thì hôm đó không có tin nhắc, hôm sau chạy lại bình
thường.

---

## Cài đặt

### 1. Cài Node.js (cần bản 18 trở lên)

```bash
node -v || sudo apt update && sudo apt install -y nodejs
node -v          # phải ≥ v18
```

Nếu Ubuntu cài bản Node quá cũ, dùng NodeSource:

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
```

### 2. Chép mã nguồn sang laptop

Chép `server.mjs` và `zalo-bridge.service` (thư mục này) vào laptop, rồi:

```bash
sudo mkdir -p /opt/zalo-bridge
sudo cp server.mjs /opt/zalo-bridge/
```

### 3. Tạo secret và file môi trường

Secret này là thứ duy nhất ngăn người lạ dùng cầu nối, nên phải đủ dài và
không được commit lên git.

```bash
openssl rand -hex 32        # chép kết quả ra, lát nữa dùng 2 lần
sudo tee /etc/zalo-bridge.env >/dev/null <<'EOF'
ZALO_BRIDGE_SECRET=<dán chuỗi vừa tạo>
PORT=8787
EOF
sudo chmod 600 /etc/zalo-bridge.env
```

### 4. Chạy thử

```bash
sudo env $(cat /etc/zalo-bridge.env | xargs) node /opt/zalo-bridge/server.mjs
```

Mở terminal khác:

```bash
curl http://127.0.0.1:8787/health     # phải trả {"ok":true}
```

Xong thì dừng bằng `Ctrl+C`.

### 5. Chạy nền bằng systemd

```bash
sudo cp zalo-bridge.service /etc/systemd/system/
sudo nano /etc/systemd/system/zalo-bridge.service   # sửa User=CHANGE_ME thành tên đăng nhập của bạn (lệnh: whoami)
sudo systemctl daemon-reload
sudo systemctl enable --now zalo-bridge
systemctl status zalo-bridge                        # phải thấy active (running)
```

Xem log: `journalctl -u zalo-bridge -f`

### 6. Mở đường vào từ Internet bằng Tailscale Funnel

Cầu nối chỉ nghe ở `127.0.0.1`, Supabase chưa gọi vào được. Tailscale Funnel
cho địa chỉ HTTPS cố định, miễn phí, không cần tên miền hay mở port.

```bash
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up            # mở link hiện ra để đăng nhập
sudo tailscale funnel 8787   # bật Funnel cho cổng 8787
```

Lệnh cuối in ra địa chỉ dạng:

```
https://ten-may.tenmang.ts.net
```

Đó là `ZALO_BRIDGE_URL`. Địa chỉ này **cố định**, khởi động lại máy vẫn giữ
nguyên. Để Funnel tự bật sau khi reboot:

```bash
sudo tailscale funnel --bg 8787
```

Nếu Funnel báo chưa được phép, vào <https://login.tailscale.com/admin/dns>
bật HTTPS, và trong Access controls thêm quyền Funnel cho máy này.

Kiểm tra từ máy khác (ví dụ máy Windows đang code):

```bash
curl https://ten-may.tenmang.ts.net/health    # phải trả {"ok":true}
```

### 7. Khai báo cho Supabase

Trong repo TaskApp:

```bash
supabase secrets set ZALO_BRIDGE_URL=https://ten-may.tenmang.ts.net \
  ZALO_BRIDGE_SECRET=<đúng chuỗi ở bước 3>
supabase functions deploy zalo-auth --no-verify-jwt
supabase functions deploy zalo-daily-reminder --no-verify-jwt
```

Không đặt `ZALO_BRIDGE_URL` thì Edge Function gọi thẳng Zalo như trước — tiện
khi chạy thử `supabase functions serve` ngay trên máy trong nước.

### 8. Tắt chế độ ngủ

Laptop gập lại là dừng cầu nối, nên:

```bash
sudo sed -i 's/^#\?HandleLidSwitch=.*/HandleLidSwitch=ignore/' /etc/systemd/logind.conf
sudo sed -i 's/^#\?HandleLidSwitchExternalPower=.*/HandleLidSwitchExternalPower=ignore/' /etc/systemd/logind.conf
sudo systemctl restart systemd-logind
```

Trên Ubuntu bản có giao diện, vào **Settings → Power** tắt thêm *Automatic
Suspend*. Nên cắm điện liên tục và tắt luôn tính năng ngủ khi đóng màn hình.

---

## Kiểm tra toàn tuyến

Mở Mini App trong Zalo bằng một tài khoản **chưa liên kết**, đăng nhập bằng
email/mật khẩu TaskApp. Cùng lúc xem log trên laptop:

```bash
journalctl -u zalo-bridge -f
```

Thấy dòng `200 GET graph.zalo.me/v2.0/me` là đã chạy thông.

## Khi có lỗi

| Hiện tượng | Nguyên nhân thường gặp |
| --- | --- |
| `Không kết nối được cầu nối Zalo` | Laptop tắt, mất mạng, hoặc Funnel chưa bật. Thử `curl <url>/health` |
| `Sai hoặc thiếu x-bridge-secret` | Secret trong `/etc/zalo-bridge.env` khác với secret đã set trên Supabase |
| Vẫn báo lỗi IP không ở Việt Nam | Edge Function chưa nhận biến mới — deploy lại 2 hàm ở bước 7 |
| `Zalo token không hợp lệ: Session key invalid` | Token Zalo hết hạn, không liên quan cầu nối. Mở lại Mini App |
| Cầu nối chạy nhưng gọi Zalo lỗi 502 | Mạng nhà chập chờn, hoặc Zalo đang bảo trì |

## Về bảo mật

- Cầu nối chỉ cho gọi 3 domain của Zalo, không thành proxy công cộng được.
- Mọi yêu cầu phải kèm đúng `x-bridge-secret`; sai là trả 401 ngay.
- Chỉ các header Zalo cần được chuyển tiếp, không kèm gì của Supabase.
- App secret của Zalo vẫn nằm trên Supabase, laptop không giữ bản sao.
- Dừng phục vụ ra Internet bất cứ lúc nào: `sudo tailscale funnel --https=443 off`
