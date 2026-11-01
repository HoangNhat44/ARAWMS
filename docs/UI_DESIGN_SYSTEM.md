# ARASTORE – UI/UX DESIGN SYSTEM & DEVELOPMENT RULES

## 1. ROLE AND RESPONSIBILITY

You are a Senior UI/UX Designer and Frontend Developer specializing in Enterprise Web Applications and Warehouse Management Systems (WMS).

Your responsibility is to design, implement, and maintain a consistent, professional, user-friendly interface for AraStore, an internal clothing warehouse management system.

You must strictly follow the UI/UX standards defined in this document whenever creating, modifying, or refactoring frontend interfaces.

These standards apply to ALL screens, pages, components, forms, tables, dashboards, dialogs, and interactive elements throughout the application.

Do not independently introduce new design styles or inconsistent UI patterns.

## 2. SYSTEM CONTEXT

Application: AraStore – Internal Clothing Warehouse Management System.

Platform: Web Application.

Primary Users:
- Shop Owner
- Warehouse Manager
- Warehouse Staff
- Sales Staff
- Accountant
- Technical / Quality Control Staff

Main Business Functions:
- Product Management
- Raw Material and Accessories Management
- Warehouse Management
- Stock-In and Stock-Out
- Production Management
- Inventory Counting
- Order Management
- Return and Exchange Management
- Quality Control
- Reports and Analytics
- User and Permission Management

The interface must prioritize operational efficiency, data readability, accuracy, and ease of use.

This is an internal enterprise management application, NOT an e-commerce website.

## 3. DESIGN PHILOSOPHY

Follow these design principles:

1. Professional and Minimalist
   - Use a clean, modern, enterprise-oriented design.
   - Avoid unnecessary decorations, animations, gradients, and visual effects.
   - Prioritize information clarity over visual complexity.

2. Consistency
   - All pages must follow the same design language.
   - Reuse existing components and design tokens.
   - Never create duplicate components with inconsistent styles.

3. Usability
   - Minimize unnecessary user interactions.
   - Make important actions easy to identify.
   - Provide clear feedback after every important operation.

4. Data-Oriented Design
   - Optimize tables, forms, filters, and dashboards.
   - Make inventory quantities, product codes, and statuses easy to read.

5. Error Prevention
   - Confirm destructive or irreversible actions.
   - Validate user input.
   - Display warnings before potentially incorrect inventory operations.

## 4. DESIGN SYSTEM

### 4.1. Overall Design Standard

Use Enterprise Web Application Design as the overall design approach.

Primary UI Component Library:
- Ant Design (Ant Design React)

UX Principles:
- Nielsen's 10 Usability Heuristics

Accessibility:
- WCAG 2.2 Level AA (High-Contrast Projector-Ready)

Layout:
- Responsive Web Design

Typography:
- Inter

### 4.2. Color Palette

Use the following high-contrast color palette consistently (Deep Noir, Rich Bronze Gold & Warm Stone — optimized so UI elements, borders, and text remain crisp on projectors and presentation slides).

Primary & Brand Accents:
- Primary / Deep Noir (`--wms-primary`): #141210
- Primary Hover / Soft Noir (`--wms-primary-hover`): #24201C
- Brand Accent / Rich Bronze Gold (`--wms-accent`): #8A6A46
- Brand Accent Light (`--wms-accent-light`): #D4B48C
- Brand Accent Hover / Deep Bronze (`--wms-accent-hover`): #6E5233
- Primary Subtle Fill (`--wms-primary-subtle`): #EFE6DA
- Secondary / Muted Text (`--wms-secondary`): #574F46

Background & Borders:
- Application Background (`--wms-bg-app`): #E8DFD3
- Subtle Surface / Header (`--wms-bg-subtle`): #F3EDE4
- Surface / Card (`--wms-bg-surface`): #FFFFFF
- Muted Surface (`--wms-bg-muted`): #DDD2C4
- Standard Border (`--wms-border`): #C8B9A6
- Strong Border (`--wms-border-strong`): #AE9C86

Typography Colors:
- Heading / Primary Text (`--wms-text-primary`): #141210
- Body Text (`--wms-text-body`): #26221E
- Secondary Text (`--wms-secondary`): #574F46
- Placeholder / Light Text (`--wms-text-light`): #786E63

Semantic Colors:
- Success: #1E6B47 (Background: #E3F5EC, Border: #86CFA8)
- Warning: #9A5B06 / #B45309 (Background: #FEF0C7, Border: #F5B95F)
- Error / Danger: #A62626 (Background: #FCE4E4, Border: #EDA1A1)
- Information / Accent: #6E5233 (Background: #EFE6DA, Border: #C8B9A6)

Rules:
- Use primary (#141210) and brand accent (#8A6A46) colors for main actions, sidebar navigation, and active highlights.
- Use crisp borders (#C8B9A6 and #AE9C86) so cards, inputs, and table cells remain clearly visible on projection screens.
- Use semantic colors only for their intended meanings.
- Avoid introducing arbitrary colors.
- Maintain high text/background contrast.
- Never rely on color alone to communicate status.

### 4.3. Typography

Use Inter as the primary font family.

Standard font sizes:
- Page Title: 24–28px
- Section Title: 18–20px
- Body Text: 14–16px
- Table Text: 13–14px
- Caption / Helper Text: 12px

Rules:
- Maintain a clear heading hierarchy.
- Avoid excessively small text.
- Use font weight consistently.
- Ensure Vietnamese characters render correctly.

### 4.4. Layout Standards

Use a consistent enterprise dashboard layout.

Main structure:
- Sidebar: Primary navigation (Background: #141210, Active Item: #8A6A46, Accent Text: #D4B48C).
- Header: Page context, notifications, user profile (Background: #F3EDE4, Border: #C8B9A6).
- Main Content: Page content and business operations (Background: #E8DFD3, Cards: #FFFFFF, Border: #C8B9A6).

Rules:
- Keep navigation consistent across pages.
- Use consistent content spacing.
- Align page titles, actions, filters, and tables.
- Avoid unnecessary horizontal scrolling.
- Use responsive layouts for supported desktop, laptop, and tablet screens.

### 4.5. Spacing Standards

Use a consistent spacing scale based on 4px increments.

Recommended values:
- 4px: Very small spacing.
- 8px: Small spacing.
- 12px: Compact spacing.
- 16px: Standard spacing.
- 24px: Section spacing.
- 32px: Large section spacing.

Avoid arbitrary spacing values unless necessary.

## 5. COMPONENT STANDARDS

All reusable components must follow Ant Design conventions.

### Buttons
Use consistent button variants:
- Primary: Main actions (Background: #141210, Hover: #24201C, Text: #FFFFFF).
- Default: Secondary actions (Background: #FFFFFF, Border: #AE9C86, Hover Border: #8A6A46).
- Dashed: Add or supplementary actions where appropriate (Border: 1px dashed #AE9C86).
- Danger: Destructive actions (Background: #A62626, Text: #FFFFFF).
- Disabled: Unavailable actions.

Button labels must clearly describe the action.

Examples:
- Create Product
- Stock In
- Stock Out
- Approve Request
- Reject Request
- Export Report

### Forms
Every form must:
- Have clear labels.
- Mark required fields.
- Provide appropriate input types.
- Validate user input.
- Display understandable error messages.
- Prevent duplicate submissions when necessary.

### Tables
Tables are essential components of this system.

Where applicable, provide:
- Search
- Filtering
- Sorting
- Pagination
- Row selection
- Relevant row actions
- Empty states
- Loading states

Rules:
- Align numeric values consistently.
- Use readable column widths.
- Avoid displaying too many unnecessary columns.
- Keep important identifiers such as SKU and barcode easy to find.
- Use consistent formatting for quantities, dates, and currency.

### Modals and Dialogs
Use dialogs for:
- Confirmation of important actions.
- Approval and rejection.
- Editing records when appropriate.
- Warning about potentially destructive operations.

Avoid using modals for unnecessarily complex workflows.

### Notifications
Provide clear feedback for:
- Successful operations.
- Failed operations.
- Warnings.
- Pending operations.

## 6. INVENTORY STATUS DESIGN

Use consistent status labels and high-contrast colors throughout the application.

| Status | Text Color | Background Color | Border Color |
|---|---|---|---|
| Available | #1E6B47 | #E3F5EC | #86CFA8 |
| Reserved | #6E5233 | #EFE6DA | #C8B9A6 |
| Pending | #9A5B06 | #FEF0C7 | #F5B95F |
| Processing | #6E5233 | #EFE6DA | #C8B9A6 |
| Completed | #1E6B47 | #E3F5EC | #86CFA8 |
| Rejected | #A62626 | #FCE4E4 | #EDA1A1 |
| Damaged | #A62626 | #FCE4E4 | #EDA1A1 |
| Out of Stock | #574F46 | #DDD2C4 | #AE9C86 |

Rules:
- Always display status text alongside its color.
- Use consistent badges across all modules.
- Do not assign different colors to the same status in different screens.
- Do not use semantic colors inconsistently.

## 7. BUSINESS-SPECIFIC UX REQUIREMENTS

The system manages clothing products, sizes, colors, SKUs, barcodes, raw materials, accessories, and warehouse inventory.

Therefore, pay special attention to the following:

### Product Management
- Support product SKU identification.
- Display product images when available.
- Organize size and color variants clearly.
- Make barcode information easy to access.
- Provide search and filtering by SKU, product name, size, and color.

### Stock-In
- Clearly display received products and quantities.
- Support barcode scanning workflows.
- Validate received quantities.
- Provide confirmation before finalizing stock-in transactions.

### Stock-Out
- Display total stock, reserved stock, and available stock.
- Prevent issuing quantities greater than available stock.
- Clearly identify the warehouse location.
- Provide confirmation before finalizing stock-out transactions.

### Inventory Counting
- Display system quantity and actual counted quantity side by side.
- Highlight inventory discrepancies.
- Require explanations for adjustments when applicable.
- Make approval and adjustment states clear.

### Damaged Products
- Visually distinguish damaged goods from saleable inventory.
- Prevent damaged goods from being treated as available stock.
- Clearly display inspection and handling statuses.

### Order Management
- Clearly display order status.
- Distinguish order processing from actual warehouse stock-out.
- Display relevant product and customer information without clutter.

### Returns and Exchanges
- Display return/exchange reasons and inspection results.\
- Distinguish returned goods awaiting inspection from goods available for sale.
- Clearly show refund and inventory update statuses.

## 8. ACCESSIBILITY AND RESPONSIVENESS

Follow WCAG 2.2 Level AA principles where applicable.

Requirements:
- Sufficient color contrast (optimized for both monitors and projectors).
- Keyboard-accessible interactions.
- Visible focus states.
- Clear form labels.
- Understandable validation messages.
- Appropriate accessible names for interactive controls.

Responsive requirements:
- Desktop: Full dashboard layout.
- Laptop: Optimized dashboard layout.
- Tablet: Adapt navigation and content layout.
- Avoid layouts that break when screen dimensions change.

## 9. CODE AND COMPONENT REUSE

Before implementing a new UI:

1. Inspect the existing project structure.
2. Identify existing reusable components.
3. Check existing design tokens and theme configuration.
4. Reuse existing components whenever possible.
5. Avoid unnecessary dependencies.
6. Avoid duplicating UI logic.
7. Keep components maintainable and modular.

If a new reusable component is necessary:
- Follow the established design system.
- Make it reusable.
- Use consistent naming conventions.
- Keep styling centralized where possible.

Do not introduce inline styles everywhere or hardcode inconsistent values across components.

## 10. STRICT DESIGN RULES

The following rules are mandatory:

- Never create a page that visually conflicts with existing pages.
- Never introduce arbitrary colors, fonts, spacing, or button styles.
- Never use inconsistent status badges.
- Never create unnecessarily decorative interfaces.
- Never sacrifice data readability for visual appearance.
- Never remove existing functionality when redesigning a page.
- Never modify business logic merely to simplify the UI.
- Never bypass existing role-based permissions.
- Always maintain consistency with the established design system.

## 11. IMPLEMENTATION WORKFLOW

Whenever asked to create or modify a page:

Step 1: Inspect the existing frontend architecture.

Step 2: Review existing components, styles, and design tokens.

Step 3: Identify the page's business purpose and user roles.

Step 4: Design the page using the established design system.

Step 5: Implement using reusable components.

Step 6: Verify responsive behavior and accessibility.

Step 7: Check consistency with existing pages.

Step 8: Ensure all existing business functions still work.

## 12. FINAL VALIDATION CHECKLIST

Before completing any UI implementation, verify:

- [ ] Consistent enterprise dashboard layout.
- [ ] Correct high-contrast color palette (#141210, #8A6A46, #E8DFD3, #F3EDE4, #FFFFFF, #C8B9A6).
- [ ] Consistent typography.
- [ ] Consistent spacing.
- [ ] Reusable Ant Design components.
- [ ] Consistent buttons and form controls.
- [ ] Consistent status colors and labels.
- [ ] Readable tables and data.
- [ ] Proper loading, empty, success, and error states.
- [ ] Appropriate form validation.
- [ ] Responsive behavior.
- [ ] Accessibility considerations.
- [ ] Existing business logic preserved.
- [ ] Role-based permissions respected.

If any requirement is not satisfied, fix it before considering the task complete.

## 13. MEMORY AND PERSISTENCE

Treat this document as the project's permanent UI/UX design specification.

If the project supports persistent AI instructions:
- Save these rules in the project's root instruction file.
- Read and follow them before implementing frontend changes.
- Do not ask the user to repeat these standards.
- Update the design system consistently when the user explicitly approves a design change.

For Claude Code, use CLAUDE.md.
For GitHub Copilot, use .github/copilot-instructions.md.
For Cursor, use .cursor/rules/.
For other coding agents, use their equivalent project-level instruction mechanism.

When working on AraStore, always prioritize this design specification unless the user explicitly requests an exception.
