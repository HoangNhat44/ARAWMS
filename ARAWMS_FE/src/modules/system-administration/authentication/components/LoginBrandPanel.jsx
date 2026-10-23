
export default function LoginBrandPanel() {
  return <>
{/* CỘT TRÁI: BRAND SHOWCASE & LOGO ARA */}
        <div style={{
          background: 'linear-gradient(145deg, #F5F0E8 0%, #EAE2D5 100%)',
          padding: '3.5rem 2.5rem',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          borderRight: '1px solid var(--ara-border)',
          position: 'relative',
        }}>
          <div>
            {/* Logo ARA hình vuông bo tròn cao cấp */}
            <div style={{
              display: 'inline-flex',
              padding: '0.85rem',
              background: '#FFFFFF',
              borderRadius: '16px',
              border: '1px solid rgba(159, 131, 101, 0.25)',
              boxShadow: 'var(--ara-shadow-sm)',
              marginBottom: '2rem',
            }}>
              <img
                src="/logo.png"
                alt="ARA Atelier Logo"
                style={{ height: '70px', width: 'auto', display: 'block' }}
              />
            </div>

            <div style={{
              display: 'inline-block',
              padding: '0.35rem 0.85rem',
              background: 'rgba(159, 131, 101, 0.15)',
              color: 'var(--ara-gold-hover)',
              borderRadius: 'var(--radius-full)',
              fontSize: '0.78rem',
              fontWeight: 700,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              marginBottom: '1rem',
            }}>
              Atelier & Warehouse Solution
            </div>

            <h1 style={{
              fontSize: '2.5rem',
              lineHeight: 1.15,
              marginBottom: '1rem',
              color: 'var(--ara-noir)',
            }}>
              Hệ thống Quản lý Kho & Xưởng May ARA
            </h1>

            <p style={{
              color: 'var(--ara-text-muted)',
              fontSize: '0.98rem',
              lineHeight: 1.6,
              marginBottom: '2rem',
            }}>
              Nền tảng kiểm soát nguyên phụ liệu, cây vải, đơn sản xuất và chuỗi cung ứng thời trang may mặc chính xác, tinh tế và đồng bộ thời gian thực.
            </p>
          </div>

        </div>
  </>;
}
