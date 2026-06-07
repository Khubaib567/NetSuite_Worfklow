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

            // 1. Create a brand NEW record instance 
            // (Change record.Type to your target record type, e.g., Custom Record or a transaction)
            const purchaseOrder = record.transform({
                fromType: record.Type.PURCHASE_REQUISITION,
                fromId: requisitionId,
                toType: record.Type.PURCHASE_ORDER,
                isDynamic: true
            });

            // 2. Link the new record back to the original Purchase Requisition
            purchaseOrder.setValue({
                fieldId: 'custrecord_linked_requisition', // Replace with your Custom Field ID
                value: requisitionId
            });

            // 3. Map additional data fields from the Excel row
            purchaseOrder.setValue({
                fieldId: 'custrecord_tracking_memo',
                value: excelMemo
            });

            purchaseOrder.setValue({
                fieldId: 'custrecord_additional_details',
                value: customValue
            });

            // 4. Save the newly created record
            const purchaseOrderId = purchaseOrder.save({ ignoreMandatoryFields: true });
            log.audit('Success', `Created New Record ID: ${purchaseOrderId} linked to Requisition ID: ${requisitionId}`);
            
        } catch (e) {
            log.error(`Failed to process row index: ${context.key}`, e.toString());
        }
    };

    const summarize = (summary) => {
        log.audit('Processing Complete', `Total rows evaluated: ${summary.usage}`);
    };

    return { getInputData, map, summarize };
});
