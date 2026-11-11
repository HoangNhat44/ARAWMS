/*
 * Người thực hiện: Nguyễn Ngọc Huy-HE171157
 * Ngày thực hiện: 30-10-2026
 * Chức năng: Áp dụng bảng màu và cỡ chữ trong UI_DESIGN_SYSTEM cho toàn bộ ứng dụng.
 */
export const palette = {
  primary: '#141210', primaryHover: '#24201C', accent: '#8A6A46', accentLight: '#D4B48C', accentHover: '#6E5233',
  subtle: '#EFE6DA', secondary: '#574F46', background: '#E8DFD3', surface: '#FFFFFF', header: '#F3EDE4', muted: '#DDD2C4',
  border: '#C8B9A6', borderStrong: '#AE9C86', body: '#26221E', light: '#786E63',
  success: '#1E6B47', successBg: '#E3F5EC', successBorder: '#86CFA8',
  warning: '#9A5B06', warningBg: '#FEF0C7', warningBorder: '#F5B95F',
  error: '#A62626', errorBg: '#FCE4E4', errorBorder: '#EDA1A1',
};

// Mọi component Ant Design dùng cùng token; không đặt lại màu tùy ý ở từng trang.
export const wmsTheme = {
  token: {
    colorPrimary: palette.primary, colorInfo: palette.accentHover, colorSuccess: palette.success, colorWarning: palette.warning, colorError: palette.error,
    colorText: palette.body, colorTextHeading: palette.primary, colorTextSecondary: palette.secondary, colorTextTertiary: palette.secondary,
    colorTextQuaternary: palette.light, colorTextDescription: palette.secondary, colorTextPlaceholder: palette.light,
    colorBgLayout: palette.background, colorBgContainer: palette.surface, colorBorder: palette.border, colorBorderSecondary: palette.border,
    colorLink: palette.accentHover, colorLinkHover: palette.primary, colorFillAlter: palette.header,
    // Nguyễn Ngọc Huy-HE171157, 2-11-2026: Phản hồi giao diện - Chữ nội dung 16px, giữ chung kích thước điều khiển.
    fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', fontSize: 16,
    fontSizeHeading1: 28, fontSizeHeading2: 20, fontSizeHeading3: 18, fontSizeHeading4: 16,
    controlHeight: 44, controlHeightSM: 36, borderRadius: 8, borderRadiusLG: 12, padding: 16, margin: 16,
    lineHeight: 1.6, motion: false,
  },
  components: {
    Layout: { headerBg: palette.header, siderBg: palette.primary, bodyBg: palette.background },
    Menu: { darkItemBg: palette.primary, darkSubMenuItemBg: palette.primary, darkItemColor: palette.accentLight,
      darkItemSelectedBg: palette.accent, darkItemSelectedColor: '#FFFFFF', darkGroupTitleColor: palette.accentLight,
      darkItemHoverBg: palette.primaryHover, itemHeight: 44, itemMarginBlock: 4 },
    Table: { headerBg: palette.header, headerColor: palette.secondary, borderColor: palette.border, rowHoverBg: palette.subtle, fontSize: 16, cellPaddingBlock: 12, cellPaddingInline: 16 },
    Button: { defaultBorderColor: palette.borderStrong, primaryShadow: 'none', defaultShadow: 'none', dangerShadow: 'none', fontWeight: 600 },
    Input: { activeBorderColor: palette.accent, hoverBorderColor: palette.accent },
    Select: {
      activeBorderColor: palette.accent, hoverBorderColor: palette.accent,
      optionSelectedBg: palette.subtle, optionSelectedColor: palette.primary, optionActiveBg: palette.header,
      controlItemBgActiveHover: palette.muted,
    },
    Tabs: { inkBarColor: palette.accent, itemSelectedColor: palette.primary, itemColor: palette.secondary },
    Modal: { titleFontSize: 20 },
    Breadcrumb: { linkColor: palette.secondary, itemColor: palette.secondary, lastItemColor: palette.primary, separatorColor: palette.secondary },
  },
};
