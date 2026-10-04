-- Correct the original display name while preserving administrator-customized names.
UPDATE "MemberOrganizationBinding"
SET "name" = '创享会员',
    "revision" = "revision" + 1,
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "id" = 'innovation' AND "name" = '创新会员';
