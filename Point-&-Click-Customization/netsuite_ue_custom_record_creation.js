/**
 * @NApiVersion 2.1
 * @NScriptType UserEventScript
 */
define(['N/record', 'N/log', 'N/search'], (record, log, search) => {

    const afterSubmit = (scriptContext) => {
        // Only run on Create, Edit, or XEdit (inline edit) actions
        if (scriptContext.type !== scriptContext.UserEventType.CREATE &&
            scriptContext.type !== scriptContext.UserEventType.EDIT &&
            scriptContext.type !== scriptContext.UserEventType.XEDIT) {
            return;
        }

        try {
            const newRecord = scriptContext.newRecord;
            const oldRecord = scriptContext.oldRecord;

            // 1. Check if the record is "Marked Paid"
            // REPLACE 'custrecord_payment_status' with your actual field ID (e.g., 'status' or a custom checkbox)
            const newStatus = newRecord.getValue({ fieldId: 'custrecord_payment_status' });
            
            let isMarkedPaidNow = false;

            if (scriptContext.type === scriptContext.UserEventType.CREATE) {
                if (newStatus === 'Mark Paid' || newStatus === true) { // Adjust based on field type (List/Record vs Checkbox)
                    isMarkedPaidNow = true;
                }
            } else {
                const oldStatus = oldRecord.getValue({ fieldId: 'custrecord_payment_status' });
                // Check if it transitioned to "Mark Paid" just now
                if (newStatus !== oldStatus && (newStatus === 'Mark Paid' || newStatus === true)) {
                    isMarkedPaidNow = true;
                }
            }

            // Exit early if the condition is not met
            if (!isMarkedPaidNow) {
                return;
            }

            log.audit('Triggered', `Record ID ${newRecord.id} marked paid. Generating Gratuity Journal Entry...`);

            // 2. Fetch necessary values from the source record
            // REPLACE these field IDs with your actual custom field internal IDs
            const gratuityAmount = parseFloat(newRecord.getValue({ fieldId: 'custrecord_gratuity_amount' })) || 0;
            const subsidiaryId = newRecord.getValue({ fieldId: 'subsidiary' }); // Mandatory for OneWorld accounts
            const memoText = `Gratuity provision for Record #${newRecord.id}`;

            if (gratuityAmount <= 0) {
                log.error('Validation Failed', 'Gratuity amount is zero or negative. Journal Entry skipped.');
                return;
            }

            // 3. Define your Accounting Configuration
            // REPLACE these placeholder IDs with your actual NetSuite chart of account internal IDs
            const GRATUITY_EXPENSE_ACCOUNT = 123; // Debit Account
            const GRATUITY_LIABILITY_ACCOUNT = 456; // Credit Account

            // 4. Create the Journal Entry Record
            const jeRecord = record.create({
                type: record.Type.JOURNAL_ENTRY,
                isDynamic: true
            });

            // Set main body fields
            jeRecord.setValue({ fieldId: 'subsidiary', value: subsidiaryId });
            jeRecord.setValue({ fieldId: 'trandate', value: new Date() });
            jeRecord.setValue({ fieldId: 'memo', value: memoText });

            // --- LINE 1: DEBIT EXPENSE ---
            jeRecord.selectNewLine({ sublistId: 'line' });
            jeRecord.setCurrentSublistValue({ sublistId: 'line', fieldId: 'account', value: GRATUITY_EXPENSE_ACCOUNT });
            jeRecord.setCurrentSublistValue({ sublistId: 'line', fieldId: 'debit', value: gratuityAmount });
            jeRecord.setCurrentSublistValue({ sublistId: 'line', fieldId: 'memo', value: memoText });
            jeRecord.commitLine({ sublistId: 'line' });

            // --- LINE 2: CREDIT LIABILITY ---
            jeRecord.selectNewLine({ sublistId: 'line' });
            jeRecord.setCurrentSublistValue({ sublistId: 'line', fieldId: 'account', value: GRATUITY_LIABILITY_ACCOUNT });
            jeRecord.setCurrentSublistValue({ sublistId: 'line', fieldId: 'credit', value: gratuityAmount });
            jeRecord.setCurrentSublistValue({ sublistId: 'line', fieldId: 'memo', value: memoText });
            jeRecord.commitLine({ sublistId: 'line' });

            // 5. Save the Journal Entry
            const jeId = jeRecord.save({
                enableSourcing: true,
                ignoreMandatoryFields: false
            });

            log.audit('Success', `Journal Entry ID ${jeId} created successfully for Gratuity.`);

        } catch (e) {
            log.error('Error creating Gratuity Journal Entry', e.toString());
        }
    };

    return { afterSubmit };
});
