-- Normalize organization entitlements from old deployable app ids to current
-- platform module slugs.

do $$
begin
  if to_regclass('authz.org_entitlements') is not null then
    alter table authz.org_entitlements
      drop constraint if exists org_entitlements_product_check;

    with normalized as (
      select
        id,
        case product
          when 'forge' then 'workflows'
          when 'flow' then 'workflows'
          when 'compose' then 'agents'
          when 'pulse' then 'ambient'
          when 'bridge' then 'secure-conversations'
          else product
        end as normalized_product,
        row_number() over (
          partition by org_slug,
            case product
              when 'forge' then 'workflows'
              when 'flow' then 'workflows'
              when 'compose' then 'agents'
              when 'pulse' then 'ambient'
              when 'bridge' then 'secure-conversations'
              else product
            end
          order by granted_at, id
        ) as duplicate_rank
      from authz.org_entitlements
    )
    delete from authz.org_entitlements entitlements
    using normalized
    where entitlements.id = normalized.id
      and normalized.duplicate_rank > 1;

    update authz.org_entitlements
    set product = case product
      when 'forge' then 'workflows'
      when 'flow' then 'workflows'
      when 'compose' then 'agents'
      when 'pulse' then 'ambient'
      when 'bridge' then 'secure-conversations'
      else product
    end;

    alter table authz.org_entitlements
      add constraint org_entitlements_product_check
      check (
        product in (
          'workflows',
          'agents',
          'ambient',
          'secure-conversations',
          'assistant'
        )
      );
  end if;
end $$;
