"use strict";
odoo.define('pos_order_and_line_notes.buttons', function (require) {
    var screens = require('point_of_sale.screens');
    var core = require('web.core');
    var WebClient = require('web.AbstractWebClient');
    var models = require('point_of_sale.models');
    
    var _t = core._t;    
    var qweb = core.qweb;
   
    
    var button_order_note = screens.ActionButtonWidget.extend({
        template: 'button_order_note',
        init: function (parent, options) {
            this._super(parent, options);
        },
        button_click: function () {
            var order = this.pos.get_order();
            if (order) {
                this.gui.show_popup('popup_order_note', {
                    title: _t('Order Note'),
                    value: order.get_note(),
                    confirm: function (note) {
                        order.set_note(note);
                        order.trigger('change', order);
                    }
                });
            }
        }
    });
    
    var button_orderline_note = screens.ActionButtonWidget.extend({
        template: 'button_orderline_note',
        button_click: function () {
            var line = this.pos.get_order().get_selected_orderline();
            if (line) {
                this.gui.show_popup('popup_orderline_note', {
                    title: _t('Line Note'),
                    value: line.get_line_note(),
                    confirm: function (note) {
                        line.set_line_note(note);
                    }
                });
            } else {
                this.pos.gui.show_popup('confirm', {
                    title: 'Warning',
                    body: 'Please select line first'
                })
            }
        }
    });    
    
    screens.define_action_button({
        'name': 'button_orderline_note',
        'widget': button_orderline_note,
        'condition': function () {
            return this.pos.config.orderline_note;
        }
    });

    screens.define_action_button({
        'name': 'button_order_note',
        'widget': button_order_note,
        'condition': function () {
            return this.pos.config.order_note;
        }
    });
    
 
});    
