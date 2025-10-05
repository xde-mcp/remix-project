import type { Test } from '../types'
import './TestTable.css'

interface TestTableProps {
  tests: Test[]
  favorites: Set<string>
  onToggleFavorite: (testName: string) => void
  onRunTest: (testName: string) => void
  title?: string
  showClearFavorites?: boolean
  onClearFavorites?: () => void
}

export function TestTable({
  tests,
  favorites,
  onToggleFavorite,
  onRunTest,
  title,
  showClearFavorites,
  onClearFavorites
}: TestTableProps) {
  if (tests.length === 0) return null

  return (
    <div className="test-table">
      {title && (
        <div className="test-table-header">
          <h6>{title}</h6>
          {showClearFavorites && onClearFavorites && (
            <button className="btn btn-sm btn-secondary" onClick={onClearFavorites}>
              Clear
            </button>
          )}
        </div>
      )}
      <div className="test-table-scroll">
        <table>
        <thead>
          <tr>
            <th>Name</th>
            <th style={{ width: '90px' }}>Built</th>
            <th style={{ width: '110px' }}></th>
          </tr>
        </thead>
        <tbody>
          {tests.map((test) => (
            <tr key={test.base}>
              <td>
                <button
                  className="star-btn"
                  onClick={() => onToggleFavorite(test.base)}
                  title="Toggle favorite"
                  aria-label={favorites.has(test.base) ? 'Remove from favorites' : 'Add to favorites'}
                >
                  {favorites.has(test.base) ? '★' : '☆'}
                </button>
                <code>{test.base}</code>
              </td>
              <td>
                {test.hasDist ? (
                  <span className="badge success">built</span>
                ) : (
                  <span className="badge warning">missing</span>
                )}
              </td>
              <td>
                <button
                  className="btn btn-sm btn-primary"
                  onClick={() => onRunTest(test.base)}
                >
                  Run
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </div>
  )
}
