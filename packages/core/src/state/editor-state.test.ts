import { describe, expect, it } from 'vitest';
import { createDoc, type ShapeObject } from '../model/doc';
import { AddObject, RemoveObject } from '../steps/object-steps';
import { Step } from '../steps/step';
import { Transaction } from '../transform/transaction';
import { EditorState, StepError } from './editor-state';

function makeShape(id: string): ShapeObject {
    return {
        kind: 'shape', id, left: 0, top: 0, angle: 0, scaleX: 1, scaleY: 1,
        shapeType: 'rect', width: 100, height: 80, fill: '#ff0000', stroke: '#000000', strokeWidth: 2
    };
}

class AlwaysFail extends Step {
    apply() {
        return { failed: 'boom' };
    }

    invert(): Step {
        return this;
    }
}

describe('EditorState', () => {
    it('has sensible defaults', () => {
        const state = new EditorState();
        expect(state.doc).toEqual(createDoc());
        expect(state.selection).toEqual([]);
        expect(state.mode).toBe('normal');
        expect(state.viewport).toEqual({ zoom: 1, panX: 0, panY: 0 });
        expect(state.backgroundImage).toBeNull();
    });

    it('accepts config overrides', () => {
        const doc = createDoc({ src: 'data:', width: 100, height: 100, name: 'a.png', angle: 0 });
        const state = new EditorState({
            doc,
            selection: ['a'],
            mode: 'crop',
            viewport: { zoom: 2, panX: 5, panY: 6 }
        });
        expect(state.doc).toBe(doc);
        expect(state.selection).toEqual(['a']);
        expect(state.mode).toBe('crop');
        expect(state.viewport).toEqual({ zoom: 2, panX: 5, panY: 6 });
        expect(state.backgroundImage).toEqual(doc.background);
    });

    it('apply produces a new state and leaves the original untouched', () => {
        const state = new EditorState();
        const tr = new Transaction(state).addStep(new AddObject(makeShape('a')));
        const next = state.apply(tr);
        expect(next).not.toBe(state);
        expect(next.doc.objects).toHaveLength(1);
        expect(next.doc.objects[0].id).toBe('a');
        expect(state.doc.objects).toHaveLength(0);
    });

    it('apply runs steps in order', () => {
        const state = new EditorState();
        const tr = new Transaction(state)
            .addStep(new AddObject(makeShape('a')))
            .addStep(new AddObject(makeShape('b')))
            .addStep(new RemoveObject('a'));
        const next = state.apply(tr);
        expect(next.doc.objects.map((o) => o.id)).toEqual(['b']);
    });

    it('apply throws StepError when a step fails', () => {
        const state = new EditorState();
        const tr = new Transaction(state).addStep(new AlwaysFail());
        expect(() => state.apply(tr)).toThrow(StepError);
        expect(() => state.apply(tr)).toThrow('boom');
    });

    it('apply replaces selection and mode when set on the transaction', () => {
        const state = new EditorState();
        const tr = new Transaction(state)
            .addStep(new AddObject(makeShape('a')))
            .setSelection(['a'])
            .setMode('text');
        const next = state.apply(tr);
        expect(next.selection).toEqual(['a']);
        expect(next.mode).toBe('text');
        expect(state.selection).toEqual([]);
        expect(state.mode).toBe('normal');
    });

    it('apply keeps selection and mode when not set on the transaction', () => {
        const state = new EditorState({ selection: ['x'], mode: 'crop' });
        const tr = new Transaction(state).addStep(new AddObject(makeShape('a')));
        const next = state.apply(tr);
        expect(next.selection).toEqual(['x']);
        expect(next.mode).toBe('crop');
    });

    it('apply shallow-merges viewport', () => {
        const state = new EditorState();
        const tr = new Transaction(state).setViewport({ zoom: 2 });
        const next = state.apply(tr);
        expect(next.viewport).toEqual({ zoom: 2, panX: 0, panY: 0 });
        expect(state.viewport).toEqual({ zoom: 1, panX: 0, panY: 0 });
    });

    it('getObject returns the object by id or undefined', () => {
        const state = new EditorState();
        const next = state.apply(new Transaction(state).addStep(new AddObject(makeShape('a'))));
        expect(next.getObject('a')?.id).toBe('a');
        expect(next.getObject('missing')).toBeUndefined();
    });
});
