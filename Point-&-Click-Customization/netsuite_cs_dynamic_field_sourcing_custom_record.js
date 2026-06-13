/**
 * @NApiVersion 2.1
 * @NScriptType ClientScript
 */
define(['N/record', 'N/search', 'N/cache', 'N/log'], (record, search, cache, log) => {

    // Global variable to hold cached lead times in memory for fast synchronous access
    let localLeadTimeMap = {};

    /**
     * Entry point: Runs when the page finishes loading.
     * Loads item lead times from NetSuite Cache or populates it via Saved Search if expired.
     */
    const pageInit = (scriptContext) => {
        try {
            // 1. Access or create a cache bucket for item data
            const itemCache = cache.getCache({
                name: 'ITEM_LEAD_TIME_CACHE',
                scope: cache.Scope.PROTECTED
            });

            // 2. Fetch data from cache. If it's a "cache miss", the loader function runs.
            const cachedDataString = itemCache.get({
                key: 'all_item_lead_times',
                ttl: 300, // Cache persists for 5 minutes across sessions
                loader: () => {
                    log.debug('Cache Miss', 'Executing Saved Search to populate cache.');
                    
                    let searchResultsMap = {};
                    
                    // Load your public pre-configured NetSuite Saved Search
                    const leadTimeSearch = search.load({
                        id: 'customsearch_item_lead_times'
                    });

                    leadTimeSearch.run().each((result) => {
                        const itemId = result.id;
                        // Replace 'custitem_lead_time' with your actual Custom Item Field Script ID
                        const leadTime = result.getValue({ name: 'custitem_lead_time' }) || 0;
                        
                        searchResultsMap[itemId] = parseInt(leadTime, 10);
                        return true; // Keep looping
                    });

                    return JSON.stringify(searchResultsMap);
                }
            });

            // 3. Populate local variable for rapid UI access in fieldChanged
            if (cachedDataString) {
                localLeadTimeMap = JSON.parse(cachedDataString);
                log.audit('Cache Initialization Complete', `Loaded ${Object.keys(localLeadTimeMap).length} items into local memory.`);
            }

        } catch (e) {
            log.error('Error in pageInit Cache Setup', e.toString());
        }
    };

    /**
     * Entry point: Runs whenever a field is changed by the user.
     */
    const fieldChanged = (scriptContext) => {
        try {
            // Destructure context object for clean access
            const { currentRecord, sublistId, fieldId, line } = scriptContext;
            const transactionId = currentRecord.id;

            // =================================================================
            // LOGIC BLOCK A: ITEM SUBLIST - LEAD TIME & CUSTOM RECORD CREATION
            // =================================================================
            if (sublistId === 'item' && fieldId === 'item') {
                
                const itemId = currentRecord.getCurrentSublistValue({
                    sublistId: 'item',
                    fieldId: 'item'
                });

                if (!itemId) return;

                // Grab lead time from local cache map instantly (No loops, no governance hit)
                const leadTimeValue = localLeadTimeMap[itemId] || 0;
                log.debug('Item Changed', `Item ID: ${itemId} | Cached Lead Time: ${leadTimeValue}`);

                // Instantiate the Standard Cycle Tracking Custom Record
                const customRec = record.create({
                    type: 'customrecord_std_cycle_tracking',
                    isDynamic: true
                });

                // Set field values on the custom record
                customRec.setValue({
                    fieldId: 'custrecord_item_link', // List/Record pointing to Item
                    value: itemId
                });

                customRec.setValue({
                    fieldId: 'custrecord_calculated_cycle', // Integer
                    value: leadTimeValue
                });

                if (transactionId) {
                    customRec.setValue({
                        fieldId: 'custrecord_source_transaction', // List/Record pointing to Transaction
                        value: transactionId
                    });
                }

                // Save custom record
                const customRecId = customRec.save({ ignoreMandatoryFields: true });
                log.audit('Custom Record Created', `Tracking Record ID: ${customRecId} generated for Item: ${itemId}`);
            }

            // =================================================================
            // LOGIC BLOCK B: TRANSACTION BODY - DELIVERY / INCOTERM LOGIC
            // =================================================================
            if (fieldId === 'custbody_delivery' || fieldId === 'custbody_incoterm') {
                
                // Extract user selected value dynamically
                const userSelectedValue = currentRecord.getValue({ fieldId: fieldId });
                log.debug('Body Field Changed', `Field: ${fieldId} changed to Value: ${userSelectedValue}`);

                // Map the active field to its matching destination field on the custom record
                let targetCustomFieldId = '';
                if (fieldId === 'custbody_delivery') {
                    targetCustomFieldId = 'custrecord_tracking_delivery';
                } else if (fieldId === 'custbody_incoterm') {
                    targetCustomFieldId = 'custrecord_tracking_incoterm';
                }

                if (transactionId && targetCustomFieldId) {
                    // Search if a custom record is already linked to this specific transaction
                    const existingTrackingId = findExistingTrackingRecord(transactionId);

                    let trackingRecord;
                    if (existingTrackingId) {
                        // Load existing record to update it
                        trackingRecord = record.load({
                            type: 'customrecord_std_cycle_tracking',
                            id: existingTrackingId,
                            isDynamic: true
                        });
                    } else {
                        // Create a new record if none exists yet
                        trackingRecord = record.create({
                            type: 'customrecord_std_cycle_tracking',
                            isDynamic: true
                        });
                        trackingRecord.setValue({
                            fieldId: 'custrecord_source_transaction',
                            value: transactionId
                        });
                    }

                    // Dynamically set the changed value into the target custom record field
                    trackingRecord.setValue({
                        fieldId: targetCustomFieldId,
                        value: userSelectedValue
                    });

                    const savedId = trackingRecord.save({ ignoreMandatoryFields: true });
                    log.audit('Dynamic Sync Success', `Updated field ${targetCustomFieldId} on Tracking Record ID: ${savedId}`);
                }
            }

        } catch (e) {
            log.error('Error in fieldChanged logic', e.toString());
        }
    };

    /**
     * Helper function to search for an existing custom record linked to the transaction.
     */
    const findExistingTrackingRecord = (transactionId) => {
        let recordId = null;
        
        search.create({
            type: 'customrecord_std_cycle_tracking',
            filters: [['custrecord_source_transaction', 'anyof', transactionId]],
            columns: ['internalid']
        }).run().each((result) => {
            recordId = result.id;
            return false; // Break loop immediately after first match
        });
        
        return recordId;
    };

    return { pageInit, fieldChanged };
});
