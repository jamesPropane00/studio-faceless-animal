# Legal and Risk Boundaries

This document is an engineering guardrail, not legal advice.

## Core rule
A product label does not control legal classification. Features must be enabled by jurisdiction only after review of the actual workflow.

## Federal transportation boundary
The prototype must not enable interstate regulated-property transportation. A company that arranges transportation of property by motor carrier for compensation may fall under federal broker rules. If the business later becomes a broker, FMCSA registration, financial security, process-agent filings, recordkeeping, and other obligations may apply.

## Worker classification
Calling a runner an independent contractor is not enough. Product design must preserve meaningful independence:

- Choose availability and requests
- Reject work without punishment
- Choose route and method, subject to safety and result requirements
- Use own vehicle and equipment
- Work on competing platforms
- Bear ordinary operating expenses
- Have opportunity for profit/loss

Do not implement mandatory shifts, acceptance-rate punishment, detailed route control, uniforms, or employee-style supervision without employment-law review.

## Insurance
Before live jobs, obtain advice on:

- Commercial activity exclusions in personal auto policies
- General liability
- Hired/non-owned or contingent auto exposures
- Cargo/property protection
- Cyber/privacy coverage
- Errors and omissions
- State-specific requirements

Never display “insured” solely because a user uploaded a photo. Use states such as `uploaded`, `under_review`, `verified_by_vendor`, `expired`, and `rejected`.

## Platform terms cannot eliminate all liability
Terms can allocate responsibilities and set procedures, but cannot erase negligence, consumer-protection duties, privacy obligations, unlawful practices, or all accident exposure.

## Privacy and security
- Minimize exact location retention.
- Hide exact addresses until matching requires disclosure.
- Encrypt secrets and sensitive identifiers.
- Signed URLs for proof images.
- Retention schedules for IDs and delivery evidence.
- Role-based access and audit logs.
- Do not expose service-role keys in frontend code.

## Feature gates
Each jurisdiction record must control:

- Is market enabled?
- Intrastate only?
- Permitted categories
- Maximum weight, dimensions, and value
- Required runner credentials
- Payment model allowed
- Background-check requirement
- Insurance requirement
- Minimum runner age
- Data-retention requirements

## Required professional reviews before public transaction launch
1. Transportation/regulatory counsel
2. State business and marketplace counsel for launch jurisdiction
3. Insurance broker familiar with gig/courier platforms
4. Tax/payment-marketplace review
5. Privacy policy and data practices
6. Terms for senders, recipients, and runners
