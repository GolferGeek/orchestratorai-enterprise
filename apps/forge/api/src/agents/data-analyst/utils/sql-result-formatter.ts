/**
 * Utility functions for formatting SQL query results into readable markdown
 */

export interface SqlResultData {
  summary?: string;
  generatedSql?: string;
  sqlResults?: string;
}

/**
 * Parse SQL results from the raw string format
 * Format: "Results (N rows):\nheader1 | header2\n--- | ---\nrow1col1 | row1col2\n..."
 */
export function parseSqlResults(sqlResults: string): {
  rowCount: number;
  headers: string[];
  rows: string[][];
} | null {
  if (!sqlResults || !sqlResults.includes('Results (')) {
    return null;
  }

  try {
    // Extract row count
    const rowCountMatch = sqlResults.match(/Results \((\d+) rows?\):/);
    const rowCount = rowCountMatch ? parseInt(rowCountMatch[1]!, 10) : 0;

    // Split into lines
    const lines = sqlResults.split('\n').filter((line) => line.trim());

    // Find the header line (usually after "Results (N rows):")
    let headerIndex = -1;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i]!.includes('|') && !lines[i]!.includes('---')) {
        headerIndex = i;
        break;
      }
    }

    if (headerIndex === -1) {
      return null;
    }

    // Parse headers
    const headerLine = lines[headerIndex]!;
    const headers = headerLine
      .split('|')
      .map((h) => h.trim())
      .filter((h) => h);

    // Find separator line (should be right after headers)
    const separatorIndex = headerIndex + 1;

    // Parse data rows (everything after separator)
    const rows: string[][] = [];
    for (let i = separatorIndex + 1; i < lines.length; i++) {
      const line = lines[i]!.trim();
      if (!line || line === '... (truncated)') {
        continue;
      }
      const cells = line
        .split('|')
        .map((cell) => cell.trim())
        .filter((cell) => cell);
      if (cells.length === headers.length) {
        rows.push(cells);
      }
    }

    return { rowCount, headers, rows };
  } catch (error) {
    console.error('Error parsing SQL results:', error);
    return null;
  }
}

/**
 * Format SQL results as a markdown table
 */
export function formatSqlResultsAsMarkdown(sqlResults: string): string {
  const parsed = parseSqlResults(sqlResults);
  if (!parsed) {
    return sqlResults; // Return original if parsing fails
  }

  const { rowCount, headers, rows } = parsed;

  // Build markdown table
  let markdown = `\n### Query Results (${rowCount} ${rowCount === 1 ? 'row' : 'rows'})\n\n`;

  // Table header
  markdown += `| ${headers.join(' | ')} |\n`;
  markdown += `| ${headers.map(() => '---').join(' | ')} |\n`;

  // Table rows
  for (const row of rows) {
    // Escape pipe characters in cell content
    const escapedRow = row.map((cell) => cell.replace(/\|/g, '\\|'));
    markdown += `| ${escapedRow.join(' | ')} |\n`;
  }

  return markdown;
}

/**
 * Format a complete Data Analyst response with summary, SQL, and results
 */
export function formatDataAnalystResponse(data: SqlResultData): string {
  let formatted = '';

  // Add summary if available
  if (data.summary) {
    formatted += `${data.summary}\n\n`;
  }

  // Add SQL query in a collapsible code block
  if (data.generatedSql) {
    formatted += `<details>\n<summary><strong>📊 View SQL Query</strong></summary>\n\n`;
    formatted += `\`\`\`sql\n${data.generatedSql}\n\`\`\`\n\n`;
    formatted += `</details>\n\n`;
  }

  // Add formatted results
  if (data.sqlResults) {
    // Extract just the results section if it includes "Results (N rows):"
    let resultsSection = data.sqlResults;

    // If sqlResults includes the SQL query, extract just the results part
    if (resultsSection.includes('Results (')) {
      // Find the "Results (N rows):" line and everything after it
      const resultsMatch = resultsSection.match(
        /Results \(\d+ rows?\):[\s\S]*/,
      );
      if (resultsMatch) {
        resultsSection = resultsMatch[0];
      }
      const formattedResults = formatSqlResultsAsMarkdown(resultsSection);
      formatted += formattedResults;
    } else {
      // If it's just the raw SQL or error, show it in a code block
      formatted += `### Query Results\n\n\`\`\`\n${data.sqlResults}\n\`\`\`\n`;
    }
  }

  return formatted.trim();
}
