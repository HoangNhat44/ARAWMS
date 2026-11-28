/*
 * Người thực hiện: Nguyễn Ngọc Huy-HE171157 | Ngày: 30-10-2026 | UC-14, UC-17; [BR: GBR-20]
 * ====================================================================================================================================
 * [BẢNG TRA CỨU CÔNG THỨC TỔNG HỢP LỢI NHUẬN & DÒNG TIỀN - BE: summarizeFinance]
 * ====================================================================================================================================
 * | STT | Chỉ số trả về                | Công thức tính toán                      | Ý nghĩa nghiệp vụ                                                 |
 * |-----|------------------------------|------------------------------------------|-------------------------------------------------------------------|
 * | 1   | netRevenue                   | revenue - returnedRevenue                | Doanh thu thuần sau khi trừ hàng trả đã duyệt                     |
 * | 2   | netCogs                      | cogs - returnedCogs                      | Giá vốn thuần sau hoàn nhập hàng đạt chuẩn (RESTOCK_SALEABLE)     |
 * | 3   | grossProfit                  | netRevenue - netCogs                     | Lợi nhuận gộp                                                     |
 * | 4   | netProfit                    | grossProfit - operatingExpenses + other  | Lợi nhuận ròng sau chi phí vận hành & thu nhập khác               |
 * | 5   | netCashFlow                  | cashIn - cashOut                         | Dòng tiền thực thu - thực chi từ cash_flow_vouchers               |
 * ====================================================================================================================================
 */
// UC-14/17: Giảm doanh thu/giá vốn bởi hàng trả, rồi tính riêng lợi nhuận và tiền thực thu/chi.
export const summarizeFinance = ({ revenue = 0, cogs = 0, returnedRevenue = 0, returnedCogs = 0, cashIn = 0, cashOut = 0, operatingExpenses = 0, otherIncome = 0 }) => {
  const netRevenue = revenue - returnedRevenue; const netCogs = cogs - returnedCogs;
  return { revenue, returnedRevenue, netRevenue, cogs, returnedCogs, netCogs,
    grossProfit: netRevenue - netCogs, operatingExpenses, otherIncome,
    netProfit: netRevenue - netCogs - operatingExpenses + otherIncome,
    cashIn, cashOut, netCashFlow: cashIn - cashOut };
};
