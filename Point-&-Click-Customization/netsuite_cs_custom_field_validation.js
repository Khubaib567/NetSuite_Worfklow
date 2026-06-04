/**
 * @NApiVersion 2.x
 * @NScriptType ClientScript
 * @NModuleScope SameAccount
 */
define(['N/ui/dialog'], function(dialog) {

    /**
     * Step 01: Event handler for 'pageInit' to verify the script is working.
     */
    function pageInit(scriptContext) {
        dialog.alert({
            title: 'Script Status',
            message: 'Client Script successfully loaded and active.'
        });
    }

    /**
     * Step 02: Event handler for 'fieldChanged' to copy 'phone' value into 'fax'.
     */
    function fieldChanged(scriptContext) {
        var currentRecord = scriptContext.currentRecord;
        var fieldId = scriptContext.fieldId;

        if (fieldId === 'phone') {
            var phoneValue = currentRecord.getValue({ fieldId: 'phone' });
            
            currentRecord.setValue({
                fieldId: 'fax',
                value: phoneValue,
                ignoreFieldChange: true 
            });
        }
    }

    /**
     * Step 03: Event handler for 'validateField' to check for empty values and format.
     */
    function validateField(scriptContext) {
        var currentRecord = scriptContext.currentRecord;
        var fieldId = scriptContext.fieldId;

        if (fieldId === 'phone') {
            var phoneValue = currentRecord.getValue({ fieldId: 'phone' });

            // Check if the phone field is empty
            if (!phoneValue || phoneValue.toString().trim() === "") {
                dialog.alert({
                    title: 'Validation Error',
                    message: 'Phone Field should not be Empty!'
                });
                return false; // Blocks the user from leaving the field blank
            }

            // Validate format if it is not empty
            var phoneRegex = /^\d{10}$/; 
            var isValid = phoneRegex.test(phoneValue);

            if (!isValid) {
                dialog.alert({
                    title: 'Validation Error',
                    message: 'Please enter a valid 10-digit phone number.'
                });
                return false; 
            }
        }
        return true; 
    }

    return {
        pageInit: pageInit,
        fieldChanged: fieldChanged,
        validateField: validateField
    };
    
});
