# Dark Mode Fix Required

## Problem
Hardcoded colors causing white-on-white text in dark mode.

## Files with hardcoded `background: white`
- ContractAnalysisDisplay.vue (3 instances)
- ComplianceAnalysisDisplay.vue (3 instances + hardcoded text colors)
- EmploymentAnalysisDisplay.vue (3 instances)
- IpAnalysisDisplay.vue (3 instances)
- LitigationAnalysisDisplay.vue (6 instances)
- PrivacyAnalysisDisplay.vue (2 instances)
- RealEstateAnalysisDisplay.vue (2 instances)
- CorporateAnalysisDisplay.vue (2 instances)
- DocumentMetadataDisplay.vue (5 instances)

## Fix
Replace hardcoded colors with Ionic CSS variables:

```css
/* Instead of: */
background: white;
background: #fff;

/* Use: */
background: var(--ion-background-color);
/* or */
background: var(--ion-color-light);

/* Instead of: */
color: #333;
color: black;

/* Use: */
color: var(--ion-text-color);
/* or */
color: var(--ion-color-dark);
```

## Quick sed command to fix most cases:
```bash
# In apps/web/src/views/agents/legal-department/components/
find . -name "*.vue" -exec sed -i '' 's/background: white;/background: var(--ion-background-color);/g' {} \;
find . -name "*.vue" -exec sed -i '' 's/background: #fff;/background: var(--ion-background-color);/g' {} \;
```

## Priority
Medium - cosmetic issue affecting dark mode users
