import { expect, test } from 'bun:test';
import { formatPostal, normalizePostal } from '../supabase/functions/_shared/geo';

test('incomplete or malformed CEP is unavailable instead of padded with invented zeros',()=>{
 for(const value of ['1002','1002000','000000000','abc11060450','11060/450',1002000,null,''])expect(normalizePostal(value,'BR')).toBeNull();
});
test('complete CEP retains leading zeros and is formatted for display',()=>{
 expect(normalizePostal('01002-000','br')).toBe('01002000');expect(formatPostal('01002000','Brazil')).toBe('01002-000');expect(formatPostal('11060450','BR')).toBe('11060-450');
});
test('international postal letters are retained and unsafe values rejected',()=>{
 expect(formatPostal('k1a 0b1','ca')).toBe('K1A 0B1');expect(normalizePostal('SW1A 1AA','gb')).toBe('SW1A 1AA');expect(normalizePostal('<bad>','us')).toBeNull();
});
