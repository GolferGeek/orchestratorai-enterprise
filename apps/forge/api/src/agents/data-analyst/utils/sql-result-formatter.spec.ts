/**
 * Unit tests for sql-result-formatter utilities
 *
 * Tests pure functions for formatting SQL query results into readable markdown.
 */
import {
  parseSqlResults,
  formatSqlResultsAsMarkdown,
  formatDataAnalystResponse,
  SqlResultData,
} from './sql-result-formatter';

describe('parseSqlResults', () => {
  it('should return null for empty string', () => {
    expect(parseSqlResults('')).toBeNull();
  });

  it("should return null when input does not contain 'Results ('", () => {
    expect(parseSqlResults('No results here')).toBeNull();
    expect(parseSqlResults('id | name\n--- | ---\n1 | Alice')).toBeNull();
  });

  it('should parse a simple single-row result', () => {
    const input = 'Results (1 row):\nid | name\n--- | ---\n1 | Alice';
    const result = parseSqlResults(input);

    expect(result).not.toBeNull();
    expect((result as NonNullable<typeof result>).rowCount).toBe(1);
    expect((result as NonNullable<typeof result>).headers).toEqual([
      'id',
      'name',
    ]);
    expect((result as NonNullable<typeof result>).rows).toEqual([
      ['1', 'Alice'],
    ]);
  });

  it('should parse a multi-row result', () => {
    const input =
      'Results (3 rows):\nid | name | email\n--- | --- | ---\n1 | Alice | alice@test.com\n2 | Bob | bob@test.com\n3 | Carol | carol@test.com';
    const result = parseSqlResults(input);

    expect(result).not.toBeNull();
    if (!result) return;
    expect(result.rowCount).toBe(3);
    expect(result.headers).toEqual(['id', 'name', 'email']);
    expect(result.rows).toHaveLength(3);
    expect(result.rows[0]).toEqual(['1', 'Alice', 'alice@test.com']);
    expect(result.rows[2]).toEqual(['3', 'Carol', 'carol@test.com']);
  });

  it('should return null when no header line with | is found', () => {
    const input = 'Results (1 row):\njust some text without pipes';
    const result = parseSqlResults(input);

    expect(result).toBeNull();
  });

  it("should handle rows that don't match column count (skip them)", () => {
    const input =
      'Results (2 rows):\nid | name\n--- | ---\n1 | Alice\nextra col | val | too many cols';
    const result = parseSqlResults(input);

    expect(result).not.toBeNull();
    if (!result) return;
    // Only the valid row should be included
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toEqual(['1', 'Alice']);
  });

  it('should skip truncated marker lines', () => {
    const input =
      'Results (150 rows):\nid | name\n--- | ---\n1 | Alice\n... (truncated)';
    const result = parseSqlResults(input);

    expect(result).not.toBeNull();
    if (!result) return;
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toEqual(['1', 'Alice']);
  });

  it('should handle 0 rows correctly', () => {
    const input = 'Results (0 rows):\nid | name\n--- | ---';
    const result = parseSqlResults(input);

    expect(result).not.toBeNull();
    if (!result) return;
    expect(result.rowCount).toBe(0);
    expect(result.rows).toHaveLength(0);
  });

  it("should correctly extract row count from 'Results (N rows):' format", () => {
    // Need at least one pipe in header line for it to be detected
    const input = 'Results (42 rows):\ncount | extra\n--- | ---\n42 | val';
    const result = parseSqlResults(input);

    expect(result).not.toBeNull();
    if (!result) return;
    expect(result.rowCount).toBe(42);
  });

  it('should parse results with many columns', () => {
    const input =
      'Results (1 row):\na | b | c | d | e\n--- | --- | --- | --- | ---\n1 | 2 | 3 | 4 | 5';
    const result = parseSqlResults(input);

    expect(result).not.toBeNull();
    if (!result) return;
    expect(result.headers).toHaveLength(5);
    expect(result.rows[0]).toEqual(['1', '2', '3', '4', '5']);
  });
});

describe('formatSqlResultsAsMarkdown', () => {
  it('should return original string when parsing fails', () => {
    const original = 'No results here';
    expect(formatSqlResultsAsMarkdown(original)).toBe(original);
  });

  it('should format single-row result as markdown table', () => {
    const input = 'Results (1 row):\nid | name\n--- | ---\n1 | Alice';
    const result = formatSqlResultsAsMarkdown(input);

    expect(result).toContain('### Query Results (1 row)');
    expect(result).toContain('| id | name |');
    expect(result).toContain('| --- | --- |');
    expect(result).toContain('| 1 | Alice |');
  });

  it("should use plural 'rows' when rowCount > 1", () => {
    const input = 'Results (2 rows):\nid | name\n--- | ---\n1 | Alice\n2 | Bob';
    const result = formatSqlResultsAsMarkdown(input);

    expect(result).toContain('### Query Results (2 rows)');
  });

  it("should use singular 'row' when rowCount is 1", () => {
    const input = 'Results (1 row):\nid | name\n--- | ---\n1 | Alice';
    const result = formatSqlResultsAsMarkdown(input);

    expect(result).toContain('(1 row)');
    expect(result).not.toContain('(1 rows)');
  });

  it('should format data as a pipe-separated table', () => {
    const input = 'Results (1 row):\nid | name\n--- | ---\n1 | Alice';
    const result = formatSqlResultsAsMarkdown(input);

    expect(result).toContain('| 1 | Alice |');
  });

  it('should format multi-column table with correct separators', () => {
    const input =
      'Results (1 row):\nid | name | status\n--- | --- | ---\n1 | Alice | active';
    const result = formatSqlResultsAsMarkdown(input);

    expect(result).toContain('| id | name | status |');
    expect(result).toContain('| --- | --- | --- |');
    expect(result).toContain('| 1 | Alice | active |');
  });

  it('should handle empty result set gracefully', () => {
    const input = 'Results (0 rows):\nid | name\n--- | ---';
    const result = formatSqlResultsAsMarkdown(input);

    expect(result).toContain('### Query Results (0 rows)');
    expect(result).toContain('| id | name |');
  });
});

describe('formatDataAnalystResponse', () => {
  it('should return empty string for empty input', () => {
    const data: SqlResultData = {};
    const result = formatDataAnalystResponse(data);
    expect(result).toBe('');
  });

  it('should include summary when provided', () => {
    const data: SqlResultData = {
      summary: 'There are 42 users in the database.',
    };
    const result = formatDataAnalystResponse(data);
    expect(result).toContain('There are 42 users in the database.');
  });

  it('should include SQL in a collapsible code block when provided', () => {
    const data: SqlResultData = {
      generatedSql: 'SELECT COUNT(*) FROM users',
    };
    const result = formatDataAnalystResponse(data);

    expect(result).toContain('<details>');
    expect(result).toContain('<summary>');
    expect(result).toContain('View SQL Query');
    expect(result).toContain('```sql');
    expect(result).toContain('SELECT COUNT(*) FROM users');
    expect(result).toContain('```');
    expect(result).toContain('</details>');
  });

  it("should format sql results as markdown table when results contain 'Results (' marker", () => {
    const data: SqlResultData = {
      sqlResults: 'Results (2 rows):\nid | name\n--- | ---\n1 | Alice\n2 | Bob',
    };
    const result = formatDataAnalystResponse(data);

    expect(result).toContain('### Query Results');
    expect(result).toContain('| id | name |');
    expect(result).toContain('| 1 | Alice |');
  });

  it("should show raw sql results in code block when not in 'Results (N rows):' format", () => {
    const data: SqlResultData = {
      sqlResults: 'No data found',
    };
    const result = formatDataAnalystResponse(data);

    expect(result).toContain('### Query Results');
    expect(result).toContain('```');
    expect(result).toContain('No data found');
  });

  it('should combine summary, SQL, and results correctly', () => {
    const data: SqlResultData = {
      summary: 'Found 2 users.',
      generatedSql: 'SELECT * FROM users LIMIT 2',
      sqlResults: 'Results (2 rows):\nid | name\n--- | ---\n1 | Alice\n2 | Bob',
    };
    const result = formatDataAnalystResponse(data);

    expect(result).toContain('Found 2 users.');
    expect(result).toContain('SELECT * FROM users LIMIT 2');
    expect(result).toContain('### Query Results');
    expect(result).toContain('| id | name |');
  });

  it('should extract Results section from sqlResults when it includes SQL query', () => {
    const data: SqlResultData = {
      sqlResults:
        'SELECT * FROM users;\nResults (1 row):\nid | name\n--- | ---\n1 | Alice',
    };
    const result = formatDataAnalystResponse(data);

    // The results section should be formatted as markdown table
    expect(result).toContain('### Query Results');
  });

  it('should trim the final result', () => {
    const data: SqlResultData = {
      summary: 'Test summary',
    };
    const result = formatDataAnalystResponse(data);

    // Result should not have leading/trailing whitespace
    expect(result).toBe(result.trim());
  });

  it('should handle only sql query no results', () => {
    const data: SqlResultData = {
      generatedSql: 'SELECT * FROM users',
    };
    const result = formatDataAnalystResponse(data);

    expect(result).toContain('SELECT * FROM users');
    // No results section
    expect(result).not.toContain('### Query Results');
  });
});
