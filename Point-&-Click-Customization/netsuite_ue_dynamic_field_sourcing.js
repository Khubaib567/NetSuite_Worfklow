/**
 * @NApiVersion 2.1
 * @NScriptType UserEventScript
 */
define(['N/search', 'N/record', 'N/log'], (search, record, log) => {

    const afterSubmit = (scriptContext) => {
        // Only run on creation or edit
        if (scriptContext.type !== scriptContext.UserEventType.CREATE && 
            scriptContext.type !== scriptContext.UserEventType.EDIT) {
            return;
        }

        try {
            const newRecord = scriptContext.newRecord;

            // 1. Get the subsidiary from the current transaction record
            const subsidiaryId = newRecord.getValue({ fieldId: 'subsidiary' });
            if (!subsidiaryId) {
                log.debug('Skipping Execution', 'No subsidiary found on the record.');
                return;
            }

            // 2. Search for the mapping record using N/search
            // Replace 'customrecord_account_mapping' with your actual custom record ID
            const mappingSearch = search.create({
                type: 'customrecord_account_mapping', 
                filters: [
                    ['custrecord_mapping_subsidiary', 'anyof', subsidiaryId],
                    'AND',
                    ['isinactive', 'is', 'F']
                ],
                columns: ['internalid']
            });

            const searchResult = mappingSearch.run().getRange({ start: 0, end: 1 });

            if (searchResult && searchResult.length > 0) {
                const mappingRecordId = searchResult[0].getValue({ name: 'internalid' });

                // 3. Load the mapping record using N/record to fetch account values
                const mappingRecord = record.load({
                    type: 'customrecord_account_mapping',
                    id: mappingRecordId
                });

                // Replace field IDs with your actual custom field IDs
                const gratuityAccount = mappingRecord.getValue({ fieldId: 'custrecord_gratuity_payable_account' });
                const bankCashAccount = mappingRecord.getValue({ fieldId: 'custrecord_bank_cash_account' });

                log.audit('Accounts Sourced', `Gratuity: ${gratuityAccount}, Bank/Cash: ${bankCashAccount}`);

                // 4. Load the current transaction in dynamic mode to apply the sourced values
                const transactionRecord = record.load({
                    type: newRecord.type,
                    id: newRecord.id,
                    isDynamic: true
                });

                // Replace field IDs with your target transaction field IDs
                transactionRecord.setValue({ fieldId: 'custbody_gratuity_payable_account', value: gratuityAccount });
                transactionRecord.setValue({ fieldId: 'custbody_bank_cash_account', value: bankCashAccount });

                const savedRecordId = transactionRecord.save({ ignoreMandatoryFields: true });
                log.debug('Transaction Updated Successfully', `Record ID: ${savedRecordId}`);
            } else {
                log.audit('No Mapping Found', `No account configuration found for Subsidiary ID: ${subsidiaryId}`);
            }

        } catch (e) {
            log.error('Error in afterSubmit', e.toString());
        }
    };

    return { afterSubmit };
});
