/**
 * @NApiVersion 2.1
 * @NScriptType MapReduceScript
 */
define(['N/record', 'N/runtime', 'N/log'], (record, runtime, log) => {

    const getInputData = () => {
        try {
            const currentScript = runtime.getCurrentScript();
            const rawJsonString = currentScript.getParameter({ name: 'custscript_excel_json_data' });

            if (!rawJsonString) return [];

            return JSON.parse(rawJsonString);
        } catch (e) {
            log.error('getInputData Error', e.toString());
            return [];
        }
    };

    const map = (context) => {
        try {
            // Context.value is a single row object from your Excel file
            const rowData = JSON.parse(context.value);
            
            // Extract values from Excel column keys
            const requisitionId = rowData["Purchase Requisition ID"]; 
            const excelMemo = rowData["Memo Notes"];
            const customValue = rowData["Custom Value"];

            if (!requisitionId) {
                log.error('Missing Data', 'Row skipped: Purchase Requisition ID is missing.');
                return;
            }

            // =================================================================
            // STEP 01: CREATE PURCHASE ORDER FROM PURCHASE REQUISITION
            // =================================================================
            const purchaseOrder = record.transform({
                fromType: record.Type.PURCHASE_REQUISITION,
                fromId: requisitionId,
                toType: record.Type.PURCHASE_ORDER,
                isDynamic: true
            });

            // Link the new record back to the original Purchase Requisition
            purchaseOrder.setValue({
                fieldId: 'custrecord_linked_requisition', 
                value: requisitionId
            });

            // Map additional data fields from the Excel row
            purchaseOrder.setValue({
                fieldId: 'custrecord_tracking_memo',
                value: excelMemo
            });

            purchaseOrder.setValue({
                fieldId: 'custrecord_additional_details',
                value: customValue
            });

            // Save the Purchase Order
            const purchaseOrderId = purchaseOrder.save({ ignoreMandatoryFields: true });
            log.audit('Success PO', `Created PO ID: ${purchaseOrderId} from Requisition: ${requisitionId}`);

            // =================================================================
            // STEP 02: TRANSFORM THE 'PURCHASE_ORDER' RECORD INTO 'ITEM_RECEIPT'
            // =================================================================
            const itemReceipt = record.transform({
                fromType: record.Type.PURCHASE_ORDER,
                fromId: purchaseOrderId,
                toType: record.Type.ITEM_RECEIPT,
                isDynamic: true
            });

            // Save the Item Receipt
            const itemReceiptId = itemReceipt.save({ ignoreMandatoryFields: true });
            log.audit('Success IR', `Created Item Receipt ID: ${itemReceiptId} from PO: ${purchaseOrderId}`);

            // =================================================================
            // STEP 03: TRANSFORM THE 'PURCHASE_ORDER' RECORD INTO 'VENDOR_BILL'
            // =================================================================
            const vendorBill = record.transform({
                fromType: record.Type.PURCHASE_ORDER,
                fromId: purchaseOrderId,
                toType: record.Type.VENDOR_BILL,
                isDynamic: true
            });

            // ISSUE LOG FIX: Handle Approval Status. 
            // Note: If NetSuite workflow/UI blocks standard setting, you may need to 
            // set approval status ('approvalstatus') to '2' (Approved) post-save via record.submitFields.
            try {
                vendorBill.setValue({
                    fieldId: 'approvalstatus',
                    value: '2' // 2 is typically 'Approved' in NetSuite
                });
            } catch (approvalError) {
                log.error('Approval Status Set Error', 'Could not set approval status directly before save: ' + approvalError.message);
            }

            // Save the Vendor Bill
            const vendorBillId = vendorBill.save({ ignoreMandatoryFields: true });
            log.audit('Success VB', `Created Vendor Bill ID: ${vendorBillId} from PO: ${purchaseOrderId}`);

            // =================================================================
            // STEP 04: TRANSFORM THE 'VENDOR_BILL' RECORD INTO 'VENDOR_PAYMENT'
            // =================================================================
            const vendorPayment = record.transform({
                fromType: record.Type.VENDOR_BILL,
                fromId: vendorBillId,
                toType: record.Type.VENDOR_PAYMENT,
                isDynamic: true
            });

            // Save the Vendor Payment
            const vendorPaymentId = vendorPayment.save({ ignoreMandatoryFields: true });
            log.audit('Success VP', `Created Vendor Payment ID: ${vendorPaymentId} from Bill: ${vendorBillId}`);
            
        } catch (e) {
            log.error(`Failed to process row index: ${context.key}`, e.toString());
        }
    };

    const summarize = (summary) => {
        log.audit('Processing Complete', `Total rows evaluated: ${summary.usage}`);
    };

    return { getInputData, map, summarize };
});
