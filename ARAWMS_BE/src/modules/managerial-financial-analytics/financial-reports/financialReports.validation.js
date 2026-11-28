/*
 * Người thực hiện: Nguyễn Ngọc Huy-HE171157
 * Ngày thực hiện: 30-10-2026
 * Công thức tổng hợp lợi nhuận và dòng tiền từ dữ liệu đã ghi nhận cho UC-111.
 */
// UC-14/17: Giảm doanh thu/giá vốn bởi hàng trả, rồi tính riêng lợi nhuận và tiền thực thu/chi.
/** Tính doanh thu và giá vốn ròng sau giảm trừ, sau đó tính lợi nhuận gộp, lợi nhuận ròng và dòng tiền ròng. */
export const summarizeFinance = ({ revenue = 0, cogs = 0, returnedRevenue = 0, returnedCogs = 0, cashIn = 0, cashOut = 0, operatingExpenses = 0, otherIncome = 0 }) => {
  const netRevenue = revenue - returnedRevenue; const netCogs = cogs - returnedCogs;
  return { revenue, returnedRevenue, netRevenue, cogs, returnedCogs, netCogs,
    grossProfit: netRevenue - netCogs, operatingExpenses, otherIncome,
    netProfit: netRevenue - netCogs - operatingExpenses + otherIncome,
    cashIn, cashOut, netCashFlow: cashIn - cashOut };
};
