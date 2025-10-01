# Remove State Field from Supplier Registration

## Task: Simplify location to city/country only (remove state field)

### Progress Tracking:

- [x] **routes/supplierRegistration.js**
  - [x] Remove `state: Joi.string().optional()` from location validation schema
  - [x] Remove `state: location.state || '',` from supplier creation

- [x] **models/User.js**
  - [x] Remove `state: String,` field from `supplierDetails.location`

### Completed:
- [x] Analysis of current implementation
- [x] Plan creation and approval
- [x] Updated supplier registration validation schema
- [x] Updated supplier creation logic to exclude state field
- [x] Updated User model schema to remove state field

### Next Steps:
- [ ] Test supplier registration endpoint
- [ ] Verify existing supplier data compatibility

## Summary of Changes Made:

1. **routes/supplierRegistration.js**:
   - Removed `state: Joi.string().optional()` from the location validation schema
   - Removed `state: location.state || '',` from the supplier creation location object
   - Location now only contains `city` and `country` fields

2. **models/User.js**:
   - Removed `state: String,` from `supplierDetails.location` schema
   - Location schema now only contains `city` and `country` fields

The supplier registration now accepts only city and country in the location field, simplifying the location structure as requested.
