import { describe, expect, it } from 'vitest';
import { EditorState } from '../state/editor-state';
import { AddObject, RemoveObject } from '../steps/object-steps';
import type { ShapeObject } from '../model/doc';
import { Transaction } from './transaction';

function makeShape(id: string): ShapeObject {
    return {
        kind: 'shape', id, left: 0, top: 0, angle: 0, scaleX: 1, scaleY: 1,
        shapeType: 'rect', width: 100, height: 80, fill: '#ff0000', stroke: '#000000', strokeWidth: 2
    };
}

describe('Transaction', () => {
    it('exposes the state it was created from', () => {
        const state = new EditorState();
        const tr = new Transaction(state);
        expect(tr.state).toBe(state);
        expect(tr.steps).toEqual([]);
    });

    it('addStep is chainable and accumulates steps', () => {
        const state = new EditorState();
        const tr = new Transaction(state);
        const step = new AddObject(makeShape('a'));
        const result = tr.addStep(step);
        expect(result).toBe(tr);
        expect(tr.steps).toEqual([step]);
        tr.addStep(new RemoveObject('a'));
        expect(tr.steps).toHaveLength(2);
        expect(tr.docChanged).toBe(true);
    });

    it('setSelection marks selectionSet and returns value', () => {
        const tr = new Transaction(new EditorState());
        expect(tr.selectionSet).toBe(false);
        expect(tr.selectionValue).toBeUndefined();
        expect(tr.setSelection(['a', 'b'])).toBe(tr);
        expect(tr.selectionSet).toBe(true);
        expect(tr.selectionValue).toEqual(['a', 'b']);
    });

    it('setMode marks modeSet and returns value', () => {
        const tr = new Transaction(new EditorState());
        expect(tr.modeSet).toBe(false);
        expect(tr.modeValue).toBeUndefined();
        expect(tr.setMode('crop')).toBe(tr);
        expect(tr.modeSet).toBe(true);
        expect(tr.modeValue).toBe('crop');
    });

    it('setViewport marks viewportSet and returns partial value', () => {
        const tr = new Transaction(new EditorState());
        expect(tr.viewportSet).toBe(false);
        expect(tr.viewportValue).toBeUndefined();
        expect(tr.setViewport({ zoom: 2 })).toBe(tr);
        expect(tr.viewportSet).toBe(true);
        expect(tr.viewportValue).toEqual({ zoom: 2 });
    });

    it('setMeta/getMeta round-trips values and is chainable', () => {
        const tr = new Transaction(new EditorState());
        expect(tr.getMeta('addToHistory')).toBeUndefined();
        expect(tr.setMeta('addToHistory', false)).toBe(tr);
        expect(tr.getMeta('addToHistory')).toBe(false);
    });

    it('docChanged is false for an empty transaction', () => {
        const tr = new Transaction(new EditorState());
        expect(tr.docChanged).toBe(false);
    });

    describe('addToHistory', () => {
        it('is false for an empty transaction', () => {
            const tr = new Transaction(new EditorState());
            expect(tr.addToHistory).toBe(false);
        });

        it('is true for a viewport-only transaction without meta (zoom)', () => {
            const tr = new Transaction(new EditorState()).setViewport({ zoom: 2 });
            expect(tr.addToHistory).toBe(true);
        });

        it('is false when meta addToHistory is false (pan)', () => {
            const tr = new Transaction(new EditorState())
                .setViewport({ panX: 10 })
                .setMeta('addToHistory', false);
            expect(tr.addToHistory).toBe(false);
        });

        it('is true for a transaction with steps', () => {
            const tr = new Transaction(new EditorState()).addStep(new AddObject(makeShape('a')));
            expect(tr.addToHistory).toBe(true);
        });

        it('is false for a selection-only transaction', () => {
            const tr = new Transaction(new EditorState()).setSelection(['a']);
            expect(tr.addToHistory).toBe(false);
        });
    });
});
