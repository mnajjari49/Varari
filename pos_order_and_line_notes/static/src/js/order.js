"use strict";
odoo.define('pos_order_and_line_notes.order', function (require) {

    var utils = require('web.utils');
    var round_pr = utils.round_precision;
    var models = require('point_of_sale.models');
    var core = require('web.core');
    var qweb = core.qweb;
    var _t = core._t;

    var _super_Order = models.Order.prototype;
    models.Order = models.Order.extend({
        initialize: function (attributes, options) {
            _super_Order.initialize.apply(this, arguments);
            this.note_id = this.note_id || [];
            this.note_id_name = this.note_id_name || [];
        },
//        init_from_JSON: function (json) {
//            var res = _super_Order.init_from_JSON.apply(this, arguments);
//            if (json.note_id) {
//               this.note_id = this.add_note(json.note_id);
//            }
//            return res;
//        },
        export_as_JSON: function () {
            var json = _super_Order.export_as_JSON.apply(this, arguments);
            if (this.note_id) {
                json.note_id = this.get_note();
            }
            if (this.note_id_name) {
                json.note_id_name = this.get_note_name();
            }
            return json;
        },
        export_for_printing: function () {
            var receipt = _super_Order.export_for_printing.call(this);
            receipt['note_id_name'] = this.note_id_name || [];
            return receipt;
        },
        add_note: function (note_id) {
            this.note_id.push(note_id);
            var order = this.pos.get_order();
            order.trigger('change');
        },
        add_note_name: function (note_name) {
            this.note_id_name.push(note_name);
            var order = this.pos.get_order();
            order.trigger('change');
        },
        get_note: function () {
            return this.note_id;
        },
        get_note_name: function () {
            return this.note_id_name;
        },
    });
    
    var _super_Orderline = models.Orderline.prototype;
    models.Orderline = models.Orderline.extend({
        initialize: function (attributes, options) {
            var res = _super_Orderline.initialize.apply(this, arguments);
            this.note_id = this.note_id || [];
            this.note_id_name = this.note_id_name || [];
            return res;
        },
//        init_from_JSON: function (json) {
//            var res = _super_Orderline.init_from_JSON.apply(this, arguments);
//            if (json.note_id) {
//               this.note_id = this.add_line_note(json.note_id);
//            }
//            return res
//        },
        export_as_JSON: function () {
            var json = _super_Orderline.export_as_JSON.apply(this, arguments);
            if (this.note_id) {
                json.note_id = this.get_line_note();
            }
            if (this.note_id_name) {
                json.note_id_name = this.get_line_note_name();
            }
            return json;
        },

        export_for_printing: function () {
            var receipt_line = _super_Orderline.export_for_printing.apply(this, arguments);
            receipt_line['note_id_name'] = this.note_id_name || [];
            return receipt_line;
        },        
        add_line_note: function (note_id) {
            this.note_id.push(note_id);
            this.trigger('change', this);
        },
        add_line_note_name: function (note_name) {
            this.note_id_name.push(note_name);
            this.trigger('change', this);
        },
        get_line_note: function () {            
            return this.note_id;
        },
        get_line_note_name: function () {
            return this.note_id_name;
        },
    });    
    
});
