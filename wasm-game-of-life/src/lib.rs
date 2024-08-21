mod utils;
use std::fmt;
use wasm_bindgen::prelude::*;

// Log to JS Console in a Browser
#[allow(unused_macros)]
macro_rules! log {
    ( $( $t:tt )* ) => {
        web_sys::console::log_1(&format!( $( $t )* ).into());
    }
}

type Cell = u8;

#[wasm_bindgen]
pub struct Universe {
    width: u32,
    height: u32,
    cells: Vec<Cell>,
}

impl Universe {
    // Get index into the Cells vector
    fn get_index(&self, row: u32, column: u32) -> usize {
        (row * self.width + column) as usize
    }

    // Number of neighbors next to the cell which are alive
    fn live_neighbor_count(&self, row: u32, column: u32) -> u8 {
        let mut count: u8 = 0;
        for delta_row in [self.height - 1, 0, 1].iter().cloned() {
            for delta_col in [self.width - 1, 0, 1].iter().cloned() {
                if delta_row == 0 && delta_col == 0 {
                    continue;
                }

                let neighbor_row = (row + delta_row) % self.height;
                let neighbor_col = (column + delta_col) % self.width;
                let idx = self.get_index(neighbor_row, neighbor_col);
                // Only full alive cells count
                count += match self.cells[idx] == 7 {
                    true => 1,
                    _ => 0,
                };
            }
        }
        count
    }
}

#[wasm_bindgen]
impl Universe {
    pub fn tock(&mut self) {
        let mut next = self.cells.clone();
        for row in 0..self.height {
            for col in 0..self.width {
                let idx = self.get_index(row, col);
                let cell = self.cells[idx];
                let alive = 7u8;
                let dead = 0u8;
                let next_cell = match cell {
                    // Any growing cell becomes alive
                    1u8 => alive,
                    // Any dying cell, dies
                    6u8 => dead,
                    // All other cells remain in the same state.
                    _ => cell,
                };
                next[idx] = next_cell;
            }
        }
        self.cells = next;
    }
    pub fn tick(&mut self) {
        let mut next = self.cells.clone();
        for row in 0..self.height {
            for col in 0..self.width {
                let idx = self.get_index(row, col);
                let cell = self.cells[idx];
                let growing = 1u8;
                let dying = 6u8;
                let alive = 7u8;
                let live_neighbors = self.live_neighbor_count(row, col);
                let next_cell = match (cell, live_neighbors) {
                    // Rule 1: Any live cell with fewer than two live neighbours
                    // dies, as if caused by underpopulation.
                    (7, x) if x < 2 => dying,
                    // Rule 2: Any live cell with two or three live neighbours
                    // lives on to the next generation.
                    (7, 2) | (7, 3) => alive,
                    // Rule 3: Any live cell with more than three live
                    // neighbours dies, as if by overpopulation.
                    (7, x) if x > 3 => dying,
                    // Rule 4: Any dead cell with exactly three live neighbours
                    // becomes a live cell, as if by reproduction.
                    (0, 3) => growing,

                    // All other cells remain in the same state.
                    (7, _) => alive,
                    (0, _) => 0u8,
                    (_, _) => 0u8,
                };
                next[idx] = next_cell;
            }
        }
        self.cells = next;
    }

    pub fn width(&self) -> u32 {
        self.width
    }

    pub fn height(&self) -> u32 {
        self.height
    }

    pub fn cells(&self) -> *const Cell {
        self.cells.as_ptr()
    }

    pub fn new(width: u32, height: u32) -> Universe {
        let cells = (0..width * height)
            .map(|i| if i % 2 == 0 || i % 7 == 0 { 1u8 } else { 6u8 })
            .collect();

        Universe {
            width,
            height,
            cells,
        }
    }

    pub fn render(&self) -> String {
        self.to_string()
    }
}

#[allow(clippy::write_with_newline)]
impl fmt::Display for Universe {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        for line in self.cells.as_slice().chunks(self.width as usize) {
            for &cell in line {
                let symbol = if cell < 7 { '◻' } else { '◼' };
                write!(f, "{}", symbol)?;
            }
            write!(f, "\n")?;
        }

        Ok(())
    }
}
