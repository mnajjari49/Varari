odoo.define('pos_payment_ref.screens', function (require) {
"use strict";

var screens = require('point_of_sale.screens');

screens.PaymentScreenWidget.include({
    show_popup_payment_info: function(options) {
        var self = this;
        window.document.body.removeEventListener('keypress', self.keyboard_handler);
        window.document.body.removeEventListener('keydown', self.keyboard_keydown_handler);
        this.gui.show_popup('payment-info-input',{
            data: options.data,
            validate_info: function(infos){
                this.$('input').removeClass('error');
                if(!infos.bank_name) {
                    this.$('input[name=payment_ref]').addClass('error');
                    this.$('input[name=payment_ref]').focus();
                    return false;
                }
                return true;
            },
            confirm: function(infos){
                options.confirm.call(self, infos);
                self.reset_input();
                self.render_paymentlines();
                window.document.body.addEventListener('keypress', self.keyboard_handler);
                window.document.body.addEventListener('keydown', self.keyboard_keydown_handler);
            },
            cancel: function(){
                window.document.body.addEventListener('keypress', self.keyboard_handler);
                window.document.body.addEventListener('keydown', self.keyboard_keydown_handler);
            },
        });
    },

    click_paymentmethods: function(id) {
        var self = this;
        var payment_method = this.pos.payment_methods_by_id[id];
//        console.log(payment_method);
        if (payment_method.pos_payment_ref == true) {
            this.show_popup_payment_info({
                confirm: function(infos) {
                    var self = this;
//                    console.log(self.pos.get_order());
                    //merge infos to new paymentline
                    self.pos.get_order().add_paymentline_with_details(payment_method, infos);
                },
            });
        }
        else {
            this._super(id);
        }
    },


});

});
