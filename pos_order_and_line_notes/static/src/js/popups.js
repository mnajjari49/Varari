"use strict";
odoo.define('pos_order_and_line_notes.popups', function (require) {

    var core = require('web.core');
    var _t = core._t;
    var rpc = require('web.rpc');
    var gui = require('point_of_sale.gui');
    var PopupWidget = require('point_of_sale.popups');   
    var qweb = core.qweb;
    
    var popup_orderline_note = PopupWidget.extend({
        template: 'popup_orderline_note',
        init: function(parent, options){
            var self = this;
            this._super(parent, options);
            this.reload_btn = function(){
                $('.fa-refresh').toggleClass('rotate', 'rotate-reset');
                self.reloading_note_list();
            };
        },

        events: {
            'click .button.back':  'click_back',
            'click .button.create':  'click_create',
            'click .button.reload': 'reload_btn',
            'click #select_note_item': 'click_select',
        },

        click_select: function(event){
            var self = this;
            var note_id = parseInt($(event.currentTarget).data('id'));
            var note_name = $(event.currentTarget).data('name');
            var line = this.pos.get_order().get_selected_orderline();
            line.add_line_note(note_id);
            line.add_line_note_name(note_name);
        },
        click_back: function(){
            var self = this;
            self.gui.close_popup();
        },

        click_create: function(event){
            val = $('input[class=note-line-input]').val();
            var line = this.pos.get_order().get_selected_orderline();
            line.add_line_note_name(val);
            $('input[class=note-line-input]').val('');
        },

        get_notes: function(){
            return this.pos.get('note_list');
        },

        show: function(){
            var self = this;
            this._super();
            this.reload_notes();
            this.reloading_note_list();

        },

        render_list: function(note_list){
            var self = this;
            var contents = this.$el[0].querySelector('.note-contents');
            contents.innerHTML = "";
            var temp = [];
            for(var i = 0, len = Math.min(note_list.length,1000); i < len; i++){
                var note_item    = note_list[i];
                var clientline_html = qweb.render('NotelistLine',{widget: this, note_item:note_item});
                var clientline = document.createElement('tbody');
                clientline.innerHTML = clientline_html;
                clientline = clientline.childNodes[1];
                contents.appendChild(clientline);
            }
        },

        reload_notes: function(){
            var self = this;
            this.render_list(self.get_notes());
        },

        reloading_note_list: function(){
            var self = this;
            var params = {
                model: 'pos.note.config',
                method: 'search_read',
                domain: [['active', '=', true]],
            }
            return rpc.query(params, {async: false}).then(function(result){
                self.pos.set({'note_list' : result});
                self.reload_notes();
                return self.pos.get('note_list');
            })
        },
    });
    gui.define_popup({name: 'popup_orderline_note', widget: popup_orderline_note});



    var popup_order_note = PopupWidget.extend({
        template: 'popup_order_note',
        init: function(parent, options){
            var self = this;
            this._super(parent, options);
            this.reload_btn = function(){
                $('.fa-refresh').toggleClass('rotate', 'rotate-reset');
                self.reloading_note_list();
            };
        },

        events: {
            'click .button.back':  'click_back',
            'click .button.create':  'click_create',
            'click .button.reload': 'reload_btn',
            'click #select_note_item': 'click_select',
        },

        click_select: function(event){
            var self = this;
            var note_id = parseInt($(event.currentTarget).data('id'));
            var note_name = $(event.currentTarget).data('name');
            var order = this.pos.get_order();
            order.add_note(note_id);
            order.add_note_name(note_name);
            console.log(order);
        },

        click_back: function(){
            var self = this;
            self.gui.close_popup();
        },

        click_create: function(event){
            val = $('input[class=note-input]').val();
            var order = this.pos.get_order();
            order.add_note_name(val);
            $('input[class=note-input]').val('');
        },

        get_notes: function(){
            return this.pos.get('note_list');
        },


        show: function(){
            var self = this;
            this._super();
            this.reload_notes();
            this.reloading_note_list();

        },

        render_list: function(note_list){
            var self = this;
            var contents = this.$el[0].querySelector('.note-contents');
            contents.innerHTML = "";
            var temp = [];
            for(var i = 0, len = Math.min(note_list.length,1000); i < len; i++){
                var note_item    = note_list[i];
                var clientline_html = qweb.render('NotelistLine',{widget: this, note_item:note_item});
                var clientline = document.createElement('tbody');
                clientline.innerHTML = clientline_html;
                clientline = clientline.childNodes[1];
                contents.appendChild(clientline);
            }
        },

        reload_notes: function(){
            var self = this;
            this.render_list(self.get_notes());
        },

        reloading_note_list: function(){
            var self = this;
            var params = {
                model: 'pos.note.config',
                method: 'search_read',
                domain: [['active', '=', true]],
            }
            return rpc.query(params, {async: false}).then(function(result){
                self.pos.set({'note_list' : result});
                self.reload_notes();
                return self.pos.get('note_list');
            })
        },
    });
    gui.define_popup({name: 'popup_order_note', widget: popup_order_note});

});
